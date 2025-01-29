export type { Question, Quiz, Prisma } from '@prisma/client';

export interface SimpleQuestion {
  question: string;
  answer: string;
}

export interface JWTPayload {
  sub: string;
  user_email: string;
  user_name: string;
}
