/** Practical, category-specific guidance shown with a Safety Scan. Wording is general advice, not official guidance. */
export const CATEGORY_ADVICE: Record<string, string> = {
  'armed-robbery': 'Avoid travelling alone or after dark in this area. Keep doors locked and windows up, and do not display phones, laptops or cash.',
  kidnapping: 'Share your live trip with someone you trust, stay on busy main roads, and avoid stopping for unknown people or unexpected roadblocks.',
  'checkpoint-extortion': 'Carry valid vehicle and personal documents, stay calm and polite at checkpoints, and note details of any unlawful demand to report later.',
  accident: 'Expect delays and slow down near the reported crashes. Leave extra time for the journey.',
  flooding: 'Do not drive through standing water. Look for a higher-ground alternative and allow extra time.',
  'bad-road': 'Reduce speed, watch for potholes and damaged surfaces, and keep your tyres and suspension in good condition.',
  'traffic-hazard': 'Drive defensively and watch for obstructions, stalled vehicles or debris.',
  fire: 'Keep clear of the affected area so emergency crews can pass, and avoid smoke-filled roads.',
  'suspicious-activity': 'Stay alert, keep your vehicle moving where it is safe to do so, and avoid stopping to investigate.',
  'medical-emergency': 'Give way to ambulances. If you must stop to help, call 112 first and do not put yourself at risk.',
  other: 'Stay alert and check the incident details before you travel.',
}

export const GENERAL_ADVICE = {
  none: ['No recent reports here, but coverage depends on users. Stay alert and keep your phone charged.'],
  safe: ['Conditions look calm. Keep normal precautions and your emergency numbers handy.'],
  caution: ['Some recent incidents were reported. Plan your trip, avoid unnecessary stops and travel in daylight if you can.'],
  elevated: ['Several serious incidents were reported recently. Consider delaying the trip, travelling in a group, or choosing another route.'],
  danger: ['This area has had many serious, recent incidents. Avoid it if possible. If you must go, share your trip with trusted people and carry emergency numbers.'],
} as const
