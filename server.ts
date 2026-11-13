import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { initializeApp as initAdminApp, cert, getApps } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore, FieldValue } from 'firebase-admin/firestore';
import { isValidEmailAddress, sendBrevoTransactionalEmail } from './functions/src/brevoClient';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const BOOTSTRAP_OWNER_EMAIL = 'reddox528@gmail.com';

let firebaseConfig: Record<string, any> = {};
try {
  const cfgPath = path.resolve(__dirname, 'firebase-applet-config.json');
  if (fs.existsSync(cfgPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
  }
} catch (err) {
  console.warn('Could not read firebase-applet-config.json:', err);
}

let adminSdkReady = false;
let adminDb: ReturnType<typeof getAdminFirestore> | null = null;
let adminAuth: ReturnType<typeof getAdminAuth> | null = null;

try {
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (serviceAccountRaw && serviceAccountRaw.trim().startsWith('{')) {
    const parsed = JSON.parse(serviceAccountRaw);
    const app = getApps().length
      ? getApps()[0]
      : initAdminApp({
          credential: cert(parsed),
          projectId: firebaseConfig.projectId || parsed.project_id,
        });
    const dbId = firebaseConfig.firestoreDatabaseId || '(default)';
    adminDb = getAdminFirestore(app, dbId);
    adminAuth = getAdminAuth(app);
    adminSdkReady = true;
  }
} catch (err) {
  console.warn('Firebase Admin SDK not initialized (optional in preview):', err);
}

async function verifyBearerToken(req: express.Request) {
  if (!adminAuth) return null;
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  try {
    return await adminAuth.verifyIdToken(token);
  } catch {
    return null;
  }
}

async function assertAdminRequest(req: express.Request) {
  const decoded = await verifyBearerToken(req);
  if (!decoded || !decoded.email_verified) return null;
  if (decoded.admin === true || decoded.email === BOOTSTRAP_OWNER_EMAIL) return decoded;
  if (adminDb) {
    const adminDoc = await adminDb.collection('admins').doc(decoded.uid).get();
    if (adminDoc.exists) return decoded;
  }
  return null;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      adminSdkReady,
      projectId: firebaseConfig.projectId || null,
      databaseId: firebaseConfig.firestoreDatabaseId || null,
    });
  });

  // Dynamic robots.txt
  app.get('/robots.txt', (req, res) => {
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    res.type('text/plain').send(
      [
        'User-agent: *',
        'Allow: /',
        'Disallow: /admin',
        'Disallow: /account',
        'Disallow: /checkout',
        `Sitemap: ${baseUrl}/sitemap.xml`,
      ].join('\n')
    );
  });

  // Dynamic sitemap.xml
  app.get('/sitemap.xml', async (req, res) => {
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const staticPaths = [
      '/',
      '/shop',
      '/about',
      '/contact',
      '/faq',
      '/privacy-policy',
      '/terms',
      '/shipping-policy',
      '/returns-policy',
    ];

    const dynamicPaths: string[] = [];
    if (adminSdkReady && adminDb) {
      try {
        const [cats, prods] = await Promise.all([
          adminDb.collection('categories').where('isActive', '==', true).get(),
          adminDb.collection('products').where('isPublished', '==', true).limit(200).get(),
        ]);
        cats.docs.forEach((d) => dynamicPaths.push(`/category/${d.data().slug}`));
        prods.docs.forEach((d) => dynamicPaths.push(`/product/${d.data().slug}`));
      } catch {
        // Fallback to static paths if adminDb read is unavailable
      }
    }

    const allUrls = [...staticPaths, ...dynamicPaths]
      .map(
        (p) =>
          `<url><loc>${baseUrl}${p}</loc><changefreq>${p === '/' ? 'daily' : 'weekly'}</changefreq></url>`
      )
      .join('');

    res
      .type('application/xml')
      .send(
        `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${allUrls}</urlset>`
      );
  });

  // Server-side Admin Custom Claim assignment when Admin SDK is configured
  app.post('/api/admin/set-claim', async (req, res) => {
    if (!adminSdkReady || !adminAuth || !adminDb) {
      return res.status(501).json({
        error: 'Firebase Admin SDK credentials (FIREBASE_SERVICE_ACCOUNT_KEY) not configured on server.',
      });
    }
    const adminUser = await assertAdminRequest(req);
    if (!adminUser) {
      return res.status(403).json({ error: 'Administrator authorization required.' });
    }

    const { email, grant } = req.body as { email?: string; grant?: boolean };
    if (!email) return res.status(400).json({ error: 'Target email is required.' });

    try {
      const target = await adminAuth.getUserByEmail(email);
      const shouldGrant = grant !== false;
      await adminAuth.setCustomUserClaims(target.uid, {
        ...(target.customClaims || {}),
        admin: shouldGrant,
      });
      if (shouldGrant) {
        await adminDb.collection('admins').doc(target.uid).set({
          uid: target.uid,
          email: target.email || email,
          grantedBy: adminUser.email || adminUser.uid,
          createdAt: FieldValue.serverTimestamp(),
        });
      } else if (target.uid !== adminUser.uid) {
        await adminDb.collection('admins').doc(target.uid).delete();
      }
      return res.json({ success: true, uid: target.uid, admin: shouldGrant });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Failed to update admin claim.' });
    }
  });

  // Server-side atomic order creation endpoint (when Admin SDK is active)
  app.post('/api/orders', async (req, res) => {
    if (!adminSdkReady || !adminDb) {
      return res.status(501).json({ code: 'ADMIN_SDK_UNCONFIGURED' });
    }
    const user = await verifyBearerToken(req);
    if (!user || !user.email_verified) {
      return res.status(401).json({ error: 'Verified user authentication required.' });
    }
    return res.status(200).json({ delegatedToCloudFunction: true });
  });

  async function dispatchDocViaBrevo(docSnap: FirebaseFirestore.DocumentSnapshot) {
    if (!adminDb) return { status: 'failed', failureReason: 'Admin SDK unavailable.' };
    const data = docSnap.data();
    if (!data || data.status === 'sent') {
      return {
        status: data?.status || 'sent',
        deliveryStatus: data?.deliveryStatus,
        providerMessageId: data?.providerMessageId || '',
      };
    }

    const [emailPrefSnap, pubSnap] = await Promise.all([
      adminDb.collection('storeSettings').doc('emailPreferences').get(),
      adminDb.collection('storeSettings').doc('public').get(),
    ]);
    const emailPrefs = emailPrefSnap.exists ? emailPrefSnap.data()! : {};
    const pub = pubSnap.exists ? pubSnap.data()! : {};

    let recipient = String(data.recipient || '').trim();
    if (data.recipientType === 'admin' && recipient === 'admin-configured') {
      recipient = String(
        emailPrefs.adminNotificationEmail || process.env.ADMIN_NOTIFICATION_EMAIL || BOOTSTRAP_OWNER_EMAIL
      ).trim();
    }

    const attemptCount = Number(data.attemptCount || 0) + 1;
    const brevoKey = process.env.BREVO_API_KEY || '';
    const senderEmail = String(emailPrefs.senderEmail || process.env.BREVO_FROM_EMAIL || '').trim();
    const senderName = String(
      emailPrefs.senderName || process.env.BREVO_FROM_NAME || pub.storeName || 'KoraMarket Nigeria'
    ).trim();
    const replyTo = String(emailPrefs.replyToEmail || pub.contactEmail || '').trim();

    if (emailPrefs.emailsEnabled === false) {
      const failureReason = 'Email sending is disabled in Admin Email Settings.';
      await docSnap.ref.update({
        recipient,
        status: 'failed',
        deliveryStatus: 'failed',
        attemptCount,
        failureReason,
        lastAttemptAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { status: 'failed', deliveryStatus: 'failed', failureReason };
    }

    const result = await sendBrevoTransactionalEmail({
      apiKey: brevoKey,
      senderEmail,
      senderName,
      toEmail: recipient,
      replyToEmail: replyTo,
      subject: String(data.subject || 'Order Notification'),
      htmlContent: String(data.htmlBody || ''),
      headers: {
        'X-Order-Number': String(data.orderNumber || ''),
        'X-Notification-Event': String(data.eventId || docSnap.id),
      },
    });

    if (!result.ok) {
      await docSnap.ref.update({
        recipient,
        status: 'failed',
        deliveryStatus: 'failed',
        attemptCount,
        failureReason: result.failureReason,
        lastAttemptAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return {
        status: 'failed',
        deliveryStatus: 'failed',
        failureReason: result.failureReason,
      };
    }

    await docSnap.ref.update({
      recipient,
      status: 'sent',
      deliveryStatus: 'accepted_by_provider',
      providerMessageId: result.messageId,
      attemptCount,
      failureReason: '',
      sentAt: FieldValue.serverTimestamp(),
      lastAttemptAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return {
      status: 'sent',
      deliveryStatus: 'accepted_by_provider',
      providerMessageId: result.messageId,
    };
  }

  app.post('/api/email/dispatch', async (req, res) => {
    if (!adminSdkReady || !adminDb) {
      return res.status(501).json({ code: 'ADMIN_SDK_UNCONFIGURED' });
    }
    const user = await verifyBearerToken(req);
    if (!user || !user.email_verified) {
      return res.status(401).json({ error: 'Verified authentication required.' });
    }
    const { notificationIds } = req.body as { notificationIds?: string[] };
    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
      return res.status(400).json({ error: 'notificationIds required.' });
    }
    const results = [];
    for (const id of notificationIds.slice(0, 10)) {
      const snap = await adminDb.collection('emailNotifications').doc(id).get();
      if (!snap.exists) continue;
      const d = snap.data()!;
      const orderSnap = d.orderId ? await adminDb.collection('orders').doc(d.orderId).get() : null;
      const isOrderOwner = orderSnap?.exists && orderSnap.data()?.customerId === user.uid;
      const isCallerAdmin = user.admin === true || user.email === BOOTSTRAP_OWNER_EMAIL;
      if (!isOrderOwner && !isCallerAdmin) continue;
      results.push({ id, ...(await dispatchDocViaBrevo(snap)) });
    }
    return res.json({ results });
  });

  app.post('/api/email/test', async (req, res) => {
    const brevoKey = process.env.BREVO_API_KEY || '';
    if (!adminSdkReady) {
      if (!brevoKey) {
        return res.status(501).json({ code: 'EMAIL_BACKEND_UNCONFIGURED' });
      }
      return res.status(501).json({ code: 'ADMIN_SDK_UNCONFIGURED' });
    }
    const adminUser = await assertAdminRequest(req);
    if (!adminUser) {
      return res.status(403).json({ error: 'Administrator authorization required.' });
    }
    const { recipientEmail, senderName, senderEmail, replyToEmail, subject, htmlBody } =
      req.body as Record<string, string>;

    const fromEmail = String(senderEmail || process.env.BREVO_FROM_EMAIL || '').trim();
    const resolvedSenderName = String(
      senderName || process.env.BREVO_FROM_NAME || 'KoraMarket Nigeria'
    ).trim();
    const targetRecipient = String(
      recipientEmail || process.env.ADMIN_NOTIFICATION_EMAIL || ''
    ).trim();

    if (!brevoKey) {
      return res.json({
        status: 'failed',
        deliveryStatus: 'failed',
        failureReason: 'BREVO_API_KEY is not configured on the server.',
      });
    }
    if (!isValidEmailAddress(fromEmail) || !isValidEmailAddress(targetRecipient)) {
      return res.json({
        status: 'failed',
        deliveryStatus: 'failed',
        failureReason: 'Configure a valid Verified Sender Email and Recipient Email first.',
      });
    }

    const result = await sendBrevoTransactionalEmail({
      apiKey: brevoKey,
      senderEmail: fromEmail,
      senderName: resolvedSenderName,
      toEmail: targetRecipient,
      replyToEmail,
      subject: subject || `${resolvedSenderName} – Email Configuration Test`,
      htmlContent: htmlBody || `<p>Test email from ${resolvedSenderName} via Brevo.</p>`,
    });

    if (!result.ok) {
      return res.json({
        status: 'failed',
        deliveryStatus: 'failed',
        failureReason: result.failureReason,
      });
    }
    return res.json({
      status: 'sent',
      deliveryStatus: 'accepted_by_provider',
      providerMessageId: result.messageId,
    });
  });

  app.post('/api/email/retry', async (req, res) => {
    if (!adminSdkReady || !adminDb) {
      return res.status(501).json({ code: 'ADMIN_SDK_UNCONFIGURED' });
    }
    const adminUser = await assertAdminRequest(req);
    if (!adminUser) {
      return res.status(403).json({ error: 'Administrator authorization required.' });
    }
    const { notificationId } = req.body as { notificationId?: string };
    if (!notificationId) return res.status(400).json({ error: 'notificationId required.' });
    const snap = await adminDb.collection('emailNotifications').doc(notificationId).get();
    if (!snap.exists) return res.status(404).json({ error: 'Notification not found.' });
    const result = await dispatchDocViaBrevo(snap);
    return res.json(result);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use('/images', express.static(path.resolve(__dirname, 'public/images')));
    app.use('/src/assets/images', express.static(path.resolve(__dirname, 'src/assets/images')));
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`KoraMarket server running on http://localhost:${PORT}`);
  });
}

startServer();
