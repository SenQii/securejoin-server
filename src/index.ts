import express, { Request, Response } from 'express';
import cors from 'cors';
import { check_existing_user, get_user_data_from_access_token } from './auth';
import {
  add_quiz,
  get_Q,
  get_user_quiz,
  validate_link,
  delete_quiz,
  does_link_exist,
  update_log,
  validate_link_by_id,
  available_OTP,
  store_OTP,
  verify_OTP,
  toggole_statue,
} from './DB';
import { Question } from './types';
import { VerificationMethod } from '@prisma/client';
import Twilio from 'twilio';
import dotenv from 'dotenv';
import { wordList } from './words';

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

const twilioServiceID = process.env.TWILIO_SERVICE_SID;
if (!twilioServiceID) {
  console.error('Twilio Service ID is not defined');
  throw new Error('Twilio Service ID is not defined');
}

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

    async function generateLink(): Promise<string> {
      const word1 = wordList[Math.floor(Math.random() * wordList.length)];
      const word2 = wordList[Math.floor(Math.random() * wordList.length)];
      const word3 = wordList[Math.floor(Math.random() * wordList.length)];
      const number = Math.floor(100 + Math.random() * 900);

      // chack its not duplicated in the DB -> later
      // const duplicated = await does_link_exist(`https://securejoin.vercel.app/${word1}-${word2}-${word3}-${number}`);
      return `https://securejoin.vercel.app/${word1}-${word2}-${word3}-${number}`;
      //
    }

    const generatedURL = await generateLink();

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
        quiz_id: quiz.id,
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
        quiz_id: quiz.id,
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
      quiz_id: quiz.id,
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
    // update attempts log:

    update_log(quiz.id, solved);

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
        .services(twilioServiceID)
        .verifications.create({ to: `${contact}`, channel: 'email' });

      console.log('status:', response.status);
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
      // generate OTP
      let OTP = Math.floor(100000 + Math.random() * 900000).toString();
      let available = await available_OTP(OTP);

      while (!available) {
        console.log('OTP is not available, generating new one...');
        OTP = Math.floor(100000 + Math.random() * 900000).toString();
        available = await available_OTP(OTP);
      }

      // send OTP

      const response = await fetch('http://waha:3000/api/sendText', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chatId: `${contact}`,
          text: `رمز التحقق الخاص بك هو: ${OTP} \n\nتنتهي صلاحية الرمز خلال 5 دقائق`,
          session: 'default',
        }),
      });
      if (response.status !== 201) {
        console.log('OTP sending failed');
        console.log('response: ', response.status);

        return res.status(500).json({
          error: 'OTP sending failed',
        });
      }
      // save OTP to DB
      store_OTP(OTP, contact);

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
    const { code, contact, quiz_id } = req.body as {
      code: string;
      contact: string;
      quiz_id: string;
    };
    if (!code)
      return res.status(400).json({
        error: 'Invalid body request',
      });

    // quiz validation
    const quiz = await validate_link_by_id(quiz_id);
    if (!quiz) {
      return res.status(404).json({
        error: 'Quiz not found',
      });
    }
    console.log('Quiz found! verifying OTP...');
    direct_link = quiz.original_url;

    // verification
    let OTP_contact = contact;
    if (!contact.includes('@')) OTP_contact = '966' + contact;

    const response = await verify_OTP(code, `${contact}`);

    console.log('statue: ', response);
    // response check & return
    if (response.status == 'approved') {
      console.log('OTP verified successfully');
      update_log(quiz.id, true);
      return res.status(200).json({
        status: 'approved',
        message: 'تم التحقق من رمز التحقق بنجاح',
        direct_link,
      });
    } else if (response.status == 'expired') {
      console.log('Verification code expired');
      update_log(quiz.id, false);
      return res
        .status(200)
        .json({ status: 'expired', message: 'انتهت صلاحية رمز التحقق' });
    }

    console.log('Verification code failed');
    update_log(quiz.id, false);
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

      console.log('User Quiz(s): ', user_quiz.length);

      res
        .status(200)
        .json({ status: 'success', message: 'User Quiz(s)', quiz: user_quiz });
    } catch (e) {
      console.log('Err in get_user_quiz: ', e);
      res.status(500).json({ error: 'Internal Server Error', message: e });
    }
  }
);

//EP - delete quiz
app.post('/delete_quiz', async (req: Request, res: Response): Promise<any> => {
  try {
    console.log('im here: ', req.body);
    const access_Token = req.headers['access-token'] as string;
    const { quiz_id } = req.body;
    // data check
    if (!quiz_id || !access_Token) {
      return res.status(400).json({
        error: 'Invalid body request',
      });
    }
    console.log('deleting quiz...');
    // auth check
    const user = get_user_data_from_access_token(access_Token);

    // fetch the quiz
    const user_quiz = await get_user_quiz(user.id);
    const quiz = user_quiz.find((q) => q.id === quiz_id); // find to delete quiz

    if (!quiz) {
      return res
        .status(404)
        .json({ error: 'Quiz not found or does not belong to you' });
    }

    // delete quiz
    await delete_quiz(quiz_id);
    console.log(`Quiz: \"${quiz.groupName}\" deleted successfully`);

    return res.status(200).json({ message: 'Quiz deleted successfully' });
  } catch (error) {
    console.log('Err in delete_quiz: ', error);
    res.status(500).json({ error: 'Internal Server Error', message: error });
  }
});

// EP - update quiz status
app.post(
  '/toggle_quiz_status',
  async (req: Request, res: Response): Promise<any> => {
    try {
      console.log('toggling quiz status...');

      // validate
      const { quiz_id, status } = req.body;
      const access_Token = req.headers['access-token'] as string;
      const user = get_user_data_from_access_token(access_Token);

      console.log('body: ', req.body);

      // CASE: invalid user
      if (!user)
        return res.status(401).json({
          error: 'Unauthorized',
        });
      // CASE: invalid body
      if (!quiz_id || !status)
        return res.status(400).json({
          error: 'Invalid body request',
        });

      // CASE: invalid status <<
      if (status !== 'activate' && status !== 'deactivate')
        return res.status(400).json({
          error: 'Invalid status',
        });

      status === 'activate'
        ? console.log('activating quiz...')
        : console.log('deactivating quiz...');

      const response = await toggole_statue(status, quiz_id);

      //  CASE: failed
      if (!response || response.status !== 'success') {
        return res.status(500).json({
          error: 'Failed to activate quiz',
        });
      }

      console.log(`Quiz ${response.status}d successfully`);

      return res.status(200).json({
        status: 'success',
        message: `Quiz ${response.status}d successfully`,
      });
    } catch (error) {
      console.log('Err in toggle_quiz_status: ', error);
      res.status(500).json({ error: 'Internal Server Error', message: error });
    }
  }
);

app.listen(port, () => {
  console.log('running at ' + port);
});
