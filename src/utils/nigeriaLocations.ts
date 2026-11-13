export const NIGERIAN_STATES: string[] = [
  'Abia',
  'Adamawa',
  'Akwa Ibom',
  'Anambra',
  'Bauchi',
  'Bayelsa',
  'Benue',
  'Borno',
  'Cross River',
  'Delta',
  'Ebonyi',
  'Edo',
  'Ekiti',
  'Enugu',
  'FCT Abuja',
  'Gombe',
  'Imo',
  'Jigawa',
  'Kaduna',
  'Kano',
  'Katsina',
  'Kebbi',
  'Kogi',
  'Kwara',
  'Lagos',
  'Nasarawa',
  'Niger',
  'Ogun',
  'Ondo',
  'Osun',
  'Oyo',
  'Plateau',
  'Rivers',
  'Sokoto',
  'Taraba',
  'Yobe',
  'Zamfara',
];

export const COMMON_LGAS_BY_STATE: Record<string, string[]> = {
  Lagos: [
    'Agege', 'Ajeromi-Ifelodun', 'Alimosho', 'Amuwo-Odofin', 'Apapa', 'Badagry',
    'Epe', 'Eti-Osa', 'Ibeju-Lekki', 'Ifako-Ijaiye', 'Ikeja', 'Ikorodu',
    'Kosofe', 'Lagos Island', 'Lagos Mainland', 'Mushin', 'Ojo', 'Oshodi-Isolo',
    'Shomolu', 'Surulere',
  ],
  'FCT Abuja': ['Abaji', 'Abuja Municipal (AMAC)', 'Bwari', 'Gwagwalada', 'Kuje', 'Kwali'],
  Rivers: ['Port Harcourt', 'Obio/Akpor', 'Eleme', 'Ikwerre', 'Oyigbo', 'Bonny'],
  Oyo: ['Ibadan North', 'Ibadan South-West', 'Ibadan North-East', 'Egbeda', 'Akinyele', 'Ogbomosho North'],
  Ogun: ['Abeokuta South', 'Abeokuta North', 'Ado-Odo/Ota', 'Sagamu', 'Ijebu Ode', 'Obafemi Owode'],
  Kano: ['Kano Municipal', 'Fagge', 'Nassarawa', 'Tarauni', 'Gwale', 'Dala'],
  Enugu: ['Enugu North', 'Enugu South', 'Enugu East', 'Nsukka', 'Udi'],
  Delta: ['Warri South', 'Uvwie', 'Oshimili South', 'Ughelli North', 'Sapele'],
  Edo: ['Oredo', 'Egor', 'Ikpoba Okha', 'Ovia North-East', 'Esan West'],
  Anambra: ['Awka South', 'Onitsha North', 'Onitsha South', 'Nnewi North', 'Idemili North'],
};

import type { DeliveryZone } from '../types/ecommerce';

export function matchDeliveryZone(
  zones: DeliveryZone[],
  state: string,
  city?: string
): DeliveryZone | null {
  const normState = state.trim().toLowerCase();
  const normCity = (city || '').trim().toLowerCase();
  if (!normState) return null;

  for (const zone of zones) {
    if (!zone.isActive) continue;
    const stateMatch = zone.supportedStates.some((s) => s.toLowerCase() === normState);
    if (!stateMatch) continue;
    if (zone.supportedLocations.length === 0) return zone;
    const locMatch = zone.supportedLocations.some(
      (l) => l.toLowerCase() === 'all' || (normCity && l.toLowerCase() === normCity)
    );
    if (locMatch) return zone;
  }
  return null;
}

