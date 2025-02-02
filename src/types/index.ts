export type { Quiz, Prisma, Option } from '@prisma/client';

export interface MCOption {
  label: string;
  isCorrect: boolean;
}

export interface Question {
  question: string;
  questionType: 'text' | 'mcq';
  answer: string;
  options?: MCOption[];
}

export interface JWTPayload {
  sub: string;
  user_email: string;
  user_name: string;
}
