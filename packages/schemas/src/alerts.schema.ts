import { z } from 'zod';

export const CreateAlertSchema = z.object({
  symbol:          z.string().trim().min(1).max(50).transform(s => s.toUpperCase()),
  threshold_price: z.number().positive(),
  direction:       z.enum(['above', 'below']),
});

export type CreateAlertDto = z.infer<typeof CreateAlertSchema>;
