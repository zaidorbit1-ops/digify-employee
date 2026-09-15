"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/auth/auth-provider";

type Note = { id: number; title: string; description?: string | null; remind_at: string; completed_at?: string | null };

export function NotesNotifier() {
  const { profile } = useAuth();

  useEffect(() => {
    async function checkReminders() {
      try {
        const response = await fetch("/api/notes", { cache: "no-store" });
        if (!response.ok) return;
        const result = await response.json() as { notes?: Note[] };
        const now = Date.now();
        (result.notes ?? [])
          .filter((note) => !note.completed_at && new Date(note.remind_at).getTime() <= now)
          .forEach((note) => {
            const key = `note-reminder-${note.id}-${note.remind_at}`;
            if (localStorage.getItem(key)) return;
            localStorage.setItem(key, "shown");
            ringReminder();
            speakReminder(note.title, profile?.role === "superadmin");
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification(`Reminder: ${note.title}`, {
                body: note.description || "Your reminder is due now.",
                icon: "/logo.png",
                tag: key,
              });
            }
          });
      } catch {
        // Reminder polling should never interrupt the dashboard.
      }
    }

    checkReminders();
    const timer = window.setInterval(checkReminders, 15000);
    return () => window.clearInterval(timer);
  }, [profile?.role]);

  return null;
}

function ringReminder() {
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.6);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.65);
    oscillator.addEventListener("ended", () => context.close());
  } catch {
    // Browser audio can be unavailable until the user interacts with the page.
  }
}

function speakReminder(title: string, isSuperadmin: boolean) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(
    isSuperadmin
      ? `Boss, a reminder for your ${title} is expired. Please have a look.`
      : `A reminder for your ${title} is expired. Please have a look.`,
  );
  utterance.rate = 0.92;
  utterance.pitch = 1.08;
  utterance.volume = 1;
  const chooseVoice = () => {
    const voices = window.speechSynthesis.getVoices();
    const femaleVoice = voices.find((voice) =>
      /female|samantha|zira|jenny|aria|susan|hazel|libby|sara|karen|moira|google us english/i.test(voice.name),
    );
    if (femaleVoice) utterance.voice = femaleVoice;
    window.speechSynthesis.speak(utterance);
  };
  if (window.speechSynthesis.getVoices().length) chooseVoice();
  else window.speechSynthesis.addEventListener("voiceschanged", chooseVoice, { once: true });
}
