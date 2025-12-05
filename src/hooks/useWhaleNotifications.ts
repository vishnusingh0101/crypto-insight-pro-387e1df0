import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';

interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, any>;
}

interface UseWhaleNotificationsReturn {
  isSupported: boolean;
  permission: NotificationPermission | 'default';
  isEnabled: boolean;
  requestPermission: () => Promise<boolean>;
  sendNotification: (payload: NotificationPayload) => void;
  toggleNotifications: () => Promise<void>;
}

export const useWhaleNotifications = (): UseWhaleNotificationsReturn => {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isEnabled, setIsEnabled] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const notifiedHashesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Check if notifications are supported
    const supported = 'Notification' in window && 'serviceWorker' in navigator;
    setIsSupported(supported);
    
    if (supported) {
      setPermission(Notification.permission);
      setIsEnabled(localStorage.getItem('whaleNotificationsEnabled') === 'true');
      
      // Register service worker
      navigator.serviceWorker.register('/service-worker.js')
        .then((reg) => {
          console.log('Service Worker registered:', reg);
          setRegistration(reg);
        })
        .catch((error) => {
          console.error('Service Worker registration failed:', error);
        });
    }
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      toast.error('Notifications are not supported in this browser');
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      
      if (result === 'granted') {
        setIsEnabled(true);
        localStorage.setItem('whaleNotificationsEnabled', 'true');
        toast.success('Whale alerts enabled! You\'ll be notified of large transactions.');
        return true;
      } else if (result === 'denied') {
        toast.error('Notification permission denied. Enable it in browser settings.');
        return false;
      }
      
      return false;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      toast.error('Failed to request notification permission');
      return false;
    }
  }, [isSupported]);

  const sendNotification = useCallback((payload: NotificationPayload) => {
    if (!isSupported || permission !== 'granted' || !isEnabled) {
      return;
    }

    // Prevent duplicate notifications
    const hash = payload.data?.hash;
    if (hash && notifiedHashesRef.current.has(hash)) {
      return;
    }
    if (hash) {
      notifiedHashesRef.current.add(hash);
      // Clean up old hashes after 5 minutes
      setTimeout(() => {
        notifiedHashesRef.current.delete(hash);
      }, 300000);
    }

    // Try using service worker if available
    if (registration?.active) {
      registration.active.postMessage({
        type: 'SHOW_NOTIFICATION',
        payload,
      });
    } else {
      // Fallback to basic notification
      try {
        new Notification(payload.title, {
          body: payload.body,
          icon: '/favicon.ico',
          tag: `whale-${Date.now()}`,
        });
      } catch (error) {
        console.error('Error showing notification:', error);
      }
    }
  }, [isSupported, permission, isEnabled, registration]);

  const toggleNotifications = useCallback(async () => {
    if (!isSupported) {
      toast.error('Notifications are not supported');
      return;
    }

    if (isEnabled) {
      setIsEnabled(false);
      localStorage.setItem('whaleNotificationsEnabled', 'false');
      toast.info('Whale alerts disabled');
    } else {
      if (permission !== 'granted') {
        await requestPermission();
      } else {
        setIsEnabled(true);
        localStorage.setItem('whaleNotificationsEnabled', 'true');
        toast.success('Whale alerts enabled!');
      }
    }
  }, [isSupported, isEnabled, permission, requestPermission]);

  return {
    isSupported,
    permission,
    isEnabled,
    requestPermission,
    sendNotification,
    toggleNotifications,
  };
};
