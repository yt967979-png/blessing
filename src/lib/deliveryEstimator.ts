/**
 * ST Courier Delivery Estimator (Flipkart & Amazon Style)
 * Calculates precise estimated delivery date based on current time & ST Courier logistics speed.
 */
export function getSTCourierDeliveryEstimate(stateOrCity: string = 'Tamil Nadu'): {
  formattedDate: string;
  formattedTime: string;
  fullEstimateString: string;
  daysRemaining: number;
  deliveryDateObj: Date;
} {
  const now = new Date();
  
  // Cutoff at 4:00 PM IST (16:00)
  const isAfterCutoff = now.getHours() >= 16;
  
  // Base delivery days: 2 days for Tamil Nadu, 3 days for other states
  const isTamilNadu =
    !stateOrCity ||
    stateOrCity.toLowerCase().includes('tamil nadu') ||
    stateOrCity.toLowerCase().includes('chennai') ||
    stateOrCity.toLowerCase().includes('tn') ||
    stateOrCity.toLowerCase().includes('coimbatore') ||
    stateOrCity.toLowerCase().includes('madurai') ||
    stateOrCity.toLowerCase().includes('salem') ||
    stateOrCity.toLowerCase().includes('trichy');

  let daysToAdd = isTamilNadu ? 2 : 3;
  if (isAfterCutoff) {
    daysToAdd += 1; // Order will be processed next morning
  }

  // Calculate target delivery date skipping Sundays (ST Courier no-delivery day)
  const targetDate = new Date(now);
  let added = 0;
  while (added < daysToAdd) {
    targetDate.setDate(targetDate.getDate() + 1);
    // 0 is Sunday
    if (targetDate.getDay() !== 0) {
      added++;
    }
  }

  // Format options (e.g., "Thursday, 30th July")
  const dayName = targetDate.toLocaleDateString('en-US', { weekday: 'long' });
  const monthName = targetDate.toLocaleDateString('en-US', { month: 'short' });
  const dayOfMonth = targetDate.getDate();

  // Ordinal suffix (1st, 2nd, 3rd, 4th...)
  const getOrdinal = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  const formattedDate = `${dayName}, ${getOrdinal(dayOfMonth)} ${monthName}`;
  const formattedTime = 'before 9 PM';
  const fullEstimateString = `Arriving by ${formattedDate} ${formattedTime}`;

  const diffTime = Math.abs(targetDate.getTime() - now.getTime());
  const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return {
    formattedDate,
    formattedTime,
    fullEstimateString,
    daysRemaining,
    deliveryDateObj: targetDate,
  };
}
