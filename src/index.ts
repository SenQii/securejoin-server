import express, { Request, Response } from 'express';
import cors from 'cors';
import { check_existing_user, get_user_data_from_access_token } from './auth';
import { add_quiz, get_Q, get_user_quiz, validate_link } from './DB';
import { Question } from './types';
import { VerificationMethod } from '@prisma/client';
import Twilio from 'twilio';
import dotenv from 'dotenv';

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

// set up middlewares
app.use(
  cors({
    origin: [
      'http://localhost:5173',
      'https://securejoin-dev.vercel.app',
      'https://securejoin.vercel.app',
    ],
  })
);
app.use(express.json());

// Twilio for OTP
const client = Twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

let direct_link = '';

// EP - creatung secureLink
app.post('/create_link', async (req: Request, res: Response): Promise<any> => {
  try {
    const {
      quiz_list,
      original_url,
      vertify_methods,
      otp_method,
    }: {
      quiz_list: Question[];
      original_url: string;
      vertify_methods: 'questions' | 'otp' | 'both';
      otp_method?: 'mail' | 'sms';
    } = req.body;

    // auth check
    const access_Token = req.headers['access-token'] as string;
    const user = get_user_data_from_access_token(access_Token);

    // Case: missing body
    if (!original_url || (!quiz_list && !vertify_methods)) {
      return res.status(400).json({
        error: 'Invalid body request',
      });
    }

    console.log('Request Received: ', req.body);
    // handling new users
    const userExists = await check_existing_user(
      user.id,
      user.email,
      user.username
    );
    // should be customized later
    const generatedURL = `https://securejoin.com/${Math.random()
      .toString(36)
      .substring(2, 11)}`;

    // push to DB
    otp_method
      ? await add_quiz(
          original_url,
          generatedURL,
          user,
          quiz_list,
          vertify_methods,
          otp_method
        )
      : await add_quiz(
          original_url,
          generatedURL,
          user,
          quiz_list,
          vertify_methods
        );

    // const user_quiz = await get_user_quiz(user.id);

    res.status(200).json({
      status: 'success',
      message: 'Link created successfully',
      link: generatedURL,
    });
  } catch (e) {
    console.log('Err in create_link: ', e);
    res.status(500).json({
      error: 'Internal Server Error',
      message: e.message,
    });
  }
});

// EP - fetch quiz / auth mehod(s)
app.post('/get_quiz', async (req: Request, res: Response): Promise<any> => {
  try {
    const { link } = req.body;

    if (!link) {
      return res.status(400).json({
        error: 'Invalid body request',
      });
    }
    console.log('going to check for the quiz: ', link);

    console.log('is the link exist? ...');
    const quiz = await validate_link(link);
    direct_link = quiz.original_url;

    if (!quiz) {
      console.log('there is no quiz with this link');
      return res.status(404).json({
        error: 'Quiz not found',
      });
    }
    console.log('Quiz found: ', JSON.stringify(quiz, null, 2));

    // CASE: no questions in Q or Both
    if (
      (!quiz.questions || quiz.questions.length === 0) &&
      (quiz.vertificationMethods.includes('BOTH') ||
        quiz.vertificationMethods.includes('QUESTIONS'))
    ) {
      console.log('there is no questions in this quiz');
      return res.status(404).json({
        error: 'No questions found',
      });
    }

    // CASE: OTP only
    if (
      quiz.vertificationMethods.includes('OTP') &&
      quiz.vertificationMethods.length === 1 &&
      quiz.OTPmethod
    ) {
      console.log('OTP only quiz');
      return res.status(200).json({
        status: 'success',
        message: 'OTP',
        otp_method: quiz.OTPmethod,
        vertify_methods: quiz.vertificationMethods,
      });

      // CASE: Questions only
    } else if (
      quiz.vertificationMethods.includes('QUESTIONS') &&
      quiz.vertificationMethods.length === 1
    ) {
      console.log('Questions only quiz');
      return res.status(200).json({
        status: 'success',
        message: 'Questions',
        quiz: quiz.questions,
        vertify_methods: quiz.vertificationMethods,
      });
    }
    // CASE: Both
    console.log('quiz_questions: ', quiz.questions);
    console.log('Quiz found: ', quiz.vertificationMethods);
    res.status(200).json({
      status: 'success',
      message: 'BOTH',
      quiz: quiz.questions,
      otp_method: quiz.OTPmethod,
      vertify_methods: quiz.vertificationMethods,
    });
  } catch (e) {
    console.log('Err in get_quiz: ', e);
    res.status(500).json({
      error: 'Internal Server Error',
      message: e,
    });
  }
});

// EP - check answers
app.post('/check_answer', async (req: Request, res: Response): Promise<any> => {
  try {
    const { link, answers } = req.body;
    if (!link || !answers) {
      return res.status(400).json({
        error: 'Invalid body request',
      });
    }

    console.log('going to check for the quiz: ', link);
    const quiz = await validate_link(link);
    const quiz_questions = get_Q(quiz.questions);

    console.log('last step, checking the answers...');

    const solved = quiz.questions.every((question, index) => {
      if (question.questionType === 'mcq') {
        const correctOption = question.options.find((opt) => opt.isCorrect);
        return answers[index] === correctOption?.label;
      } else {
        return answers[index] === question.answer;
      }
    });

    console.log('solved: ', solved);

    if (!solved)
      return res.status(200).json({
        status: 'failed',
        message: 'Wrong answer',
      });

    console.log('All answers are correct!');
    res.status(200).json({
      status: 'success',
      message: 'All answers are correct!',
      direct_link: quiz.original_url,
    });
  } catch (e) {
    console.log('Err in check_answer: ', e);
    res.status(500).json({
      error: 'Internal Server Error',
      message: e,
    });
  }
});

// EP - OTP handle
app.post('/send_otp', async (req: Request, res: Response): Promise<any> => {
  try {
    console.log('sending OTP...');

    // req body chek
    const { method, contact } = req.body as {
      method: 'mail' | 'sms';
      contact: string;
    };
    console.log('req.body: ', req.body);

    if (!method || !contact)
      return res.status(400).json({
        error: 'Invalid body request',
      });

    // send OTP
    if (method === 'mail') {
      const response = await client.verify.v2
        .services('VA1294d0625bdb7f42e0da629ca314f4ad')
        .verifications.create({ to: `${contact}`, channel: 'email' });

      console.log('status:', response);
      if (response.status !== 'pending' && response.status !== 'approved') {
        console.log('OTP sending failed');
        return res.status(500).json({
          error: 'OTP sending failed',
        });
      }
      res.status(200).json({
        status: 'approved',
        message: 'تم إرسال رمز التحقق بنجاح, يرجى التحقق من البريد الإلكتروني',
      });
    } else {
      const response = await client.verify.v2
        .services('VA1294d0625bdb7f42e0da629ca314f4ad')
        .verifications.create({ to: `${contact}`, channel: 'sms' });

      console.log('status:', response);
      if (response.status !== 'pending' && response.status !== 'approved') {
        console.log('OTP sending failed');
        return res.status(500).json({
          error: 'OTP sending failed',
        });
      }
      res.status(200).json({
        status: 'approved',
        message: 'تم إرسال رمز التحقق بنجاح, يرجى التحقق من الرسائل النصية',
      });
    }
  } catch (e) {
    console.log('Err in send_otp: ', e);
    if (e.status == 403)
      return res.status(403).json({
        error: 'Forbidden',
        message: 'تم حظر الرقم عن استخدام الخدمة',
      });
    res.status(500).json({
      error: 'Internal Server Error',
      message: e.message,
    });
  }
});

// EP - OTP verification
app.post('/verify_otp', async (req: Request, res: Response): Promise<any> => {
  try {
    console.log('verifying OTP...');

    // req body check
    const { code, contact } = req.body as {
      code: string;
      contact: string;
    };
    if (!code)
      return res.status(400).json({
        error: 'Invalid body request',
      });

    // verification
    const response = await client.verify.v2
      .services('VA1294d0625bdb7f42e0da629ca314f4ad')
      .verificationChecks.create({ to: contact, code: code });

    console.log('statue: ', response);
    // response check & return
    if (response.status == 'approved') {
      console.log('OTP verified successfully');
      return res.status(200).json({
        status: 'approved',
        message: 'تم التحقق من رمز التحقق بنجاح',
        direct_link,
      });
    } else if (response.status == 'expired') {
      console.log('Verification code expired');
      return res
        .status(200)
        .json({ status: 'expired', message: 'انتهت صلاحية رمز التحقق' });
    }

    console.log('Verification code failed');
    return res
      .status(200)
      .json({ status: 'failed', message: 'فشل التحقق من رمز التحقق' });
  } catch (error) {
    console.log('Err in verify_otp: ', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error,
    });
  }
});

// EP - user's quiz(s)
app.post(
  '/get_user_quiz',
  async (req: Request, res: Response): Promise<any> => {
    try {
      console.log('getting user quiz(s)...');
      const access_Token = req.headers['access-token'] as string;
      const user = get_user_data_from_access_token(access_Token);
      const user_quiz = await get_user_quiz(user.id);

      console.log('User Quiz(s): ', user_quiz);

      res
        .status(200)
        .json({ status: 'success', message: 'User Quiz(s)', quiz: user_quiz });
    } catch (e) {
      console.log('Err in get_user_quiz: ', e);
      res.status(500).json({ error: 'Internal Server Error', message: e });
    }
  }
);

app.listen(port, () => {
  console.log('running at ' + port);
});
