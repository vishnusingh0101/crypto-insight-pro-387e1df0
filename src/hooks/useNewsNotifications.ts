import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface NewsAlert {
  title: string;
  message: string;
  impact: "high" | "medium" | "low";
  coins: string[];
}

export const useNewsNotifications = (news: any[] | undefined) => {
  const lastAnalyzedRef = useRef<string>("");
  const notificationPermissionRef = useRef<NotificationPermission>("default");

  // Request notification permission on mount
  useEffect(() => {
    if ("Notification" in window) {
      Notification.requestPermission().then((permission) => {
        notificationPermissionRef.current = permission;
      });
    }
  }, []);

  const sendNotification = useCallback((alert: NewsAlert) => {
    // Always show toast notification
    toast({
      title: `🚨 ${alert.title}`,
      description: `${alert.message} (${alert.coins.join(", ")})`,
      variant: alert.impact === "high" ? "destructive" : "default",
    });

    // Send browser notification if permitted
    if ("Notification" in window && notificationPermissionRef.current === "granted") {
      new Notification(`Crypto Alert: ${alert.title}`, {
        body: `${alert.message}\nAffected: ${alert.coins.join(", ")}`,
        icon: "/favicon.ico",
        tag: `crypto-alert-${Date.now()}`,
      });
    }
  }, []);

  const analyzeNews = useCallback(async (newsItems: any[]) => {
    if (!newsItems || newsItems.length === 0) return;

    // Create a hash of news titles to check if we've already analyzed this set
    const newsHash = newsItems.slice(0, 5).map(n => n.title).join("|");
    if (newsHash === lastAnalyzedRef.current) return;
    lastAnalyzedRef.current = newsHash;

    try {
      const { data, error } = await supabase.functions.invoke("analyze-news-impact", {
        body: { news: newsItems },
      });

      if (error) {
        console.error("News analysis error:", error);
        return;
      }

      const alerts = data?.alerts || [];
      
      // Send notifications for each alert
      alerts.forEach((alert: NewsAlert) => {
        sendNotification(alert);
      });
    } catch (err) {
      console.error("Failed to analyze news:", err);
    }
  }, [sendNotification]);

  // Analyze news when it changes
  useEffect(() => {
    if (news && news.length > 0) {
      analyzeNews(news);
    }
  }, [news, analyzeNews]);

  return { analyzeNews };
};
