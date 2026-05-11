import { z } from 'zod';

export const BACKUP_FREQUENCIES = [0, 1, 3, 5, 7, 15, 30] as const;
export type BackupFrequency = (typeof BACKUP_FREQUENCIES)[number];

export const BACKUP_DESTINATIONS = ['email', 'gdrive', 'backblaze', 'whatsapp'] as const;
export type BackupDestination = (typeof BACKUP_DESTINATIONS)[number];

export type BackupSchedule = {
  frequency_days: BackupFrequency;
  destinations: BackupDestination[];
  email_to?: string;
  whatsapp_to?: string;
};

export const backupScheduleSchema = z.object({
  frequency_days: z.union(BACKUP_FREQUENCIES.map((f) => z.literal(f)) as never),
  destinations: z.array(z.enum(BACKUP_DESTINATIONS)).default([]),
  email_to: z.string().email('Invalid email').optional().or(z.literal('')),
  whatsapp_to: z.string().max(30).optional().or(z.literal('')),
});

export const DEFAULT_SCHEDULE: BackupSchedule = {
  frequency_days: 7,
  destinations: ['email'],
};

export const FREQUENCY_LABEL: Record<BackupFrequency, string> = {
  0: 'Off',
  1: 'Every day',
  3: 'Every 3 days',
  5: 'Every 5 days',
  7: 'Every 7 days',
  15: 'Every 15 days',
  30: 'Every 30 days',
};

export const DESTINATION_LABEL: Record<BackupDestination, string> = {
  email: 'Email (Resend)',
  gdrive: 'Google Drive',
  backblaze: 'Backblaze B2',
  whatsapp: 'WhatsApp',
};

/** Which destinations are actually wired up vs. "Coming soon". */
export const DESTINATION_AVAILABLE: Record<BackupDestination, boolean> = {
  email: !!process.env.RESEND_API_KEY,
  gdrive: false,
  backblaze: false,
  whatsapp: false, // gated by Piece 10 messaging integration
};
