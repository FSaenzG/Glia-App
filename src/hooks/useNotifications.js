import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Sends a notification to a specific user.
 * @param {string} userId - The ID of the recipient user.
 * @param {Object} notification - The notification object.
 * @param {string} notification.type - Type: 'reservation_confirmed', 'reservation_cancelled', 'low_stock', 'damage_report', 'cert_approved', 'cleaning_duty', 'reminder'
 * @param {string} notification.message - The notification text.
 */
export async function sendNotification(userId, notification) {
    if (!userId) return;
    try {
        await addDoc(collection(db, 'notifications', userId, 'items'), {
            ...notification,
            read: false,
            createdAt: serverTimestamp()
        });
    } catch (error) {
        console.error('Error sending notification:', error);
    }
}
