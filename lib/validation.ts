import { z } from 'zod'

export const feedbackSchema = z.object({
  stationId: z.union([z.string(), z.number()]),
  vote: z.enum(['+1', '-1'])
})
