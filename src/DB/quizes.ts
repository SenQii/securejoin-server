import { prisma } from '.';
import { Question, Quiz, Option } from '../types';
import { type VerificationMethod } from '@prisma/client';

type generate_link = {
  id: string;
  ownerId: string;
  url: string;
  original_url: string;
  vertificationMethods: VerificationMethod[];
};

// is the link valid?
export async function validate_link(link: string) {
  try {
    const quiz = await prisma.quiz.findFirst({
      where: {
        url: link,
      },
      include: {
        questions: {
          include: { options: true },
        },
      },
    });
    // CASE : quiz not found
    if (!quiz) throw new Error('Quiz not found');
    return quiz;
  } catch (e) {
    throw new Error(`Error in validate_link: ${e.message}`);
  }
}

export async function validate_link_by_id(id: string) {
  try {
    const quiz = await prisma.quiz.findFirst({
      where: {
        id: id,
      },
      include: {
        questions: {
          include: { options: true },
        },
      },
    });

    // CASE : quiz not found
    if (!quiz) throw new Error('Quiz not found');

    return quiz;
  } catch (error) {
    throw new Error(`Error in validate_link_by_id: ${error.message}`);
  }
}

// fetch the user's quizes
export async function get_user_quiz(user_id: string) {
  try {
    const user_quiz = await prisma.quiz.findMany({
      where: {
        ownerId: user_id,
      },
    });

    console.log('ur quizez: ', user_quiz.length);
    return user_quiz;
  } catch (e) {
    throw new Error('Error in get_user_quiz: ', e);
  }
}

// add questions to the desired quiz
export async function add_questions(quiz_list: Question[], quiz_id: string) {
  try {
    // per question, add them to the db
    console.log('Adding questions to the db...');

    const added_Q = quiz_list.map(async (item) => {
      if (!item.question) {
        throw new Error('Question text is required');
      }
      console.log('item.questionType: ', item.questionType);

      // Create the question
      const createdQuestion = await prisma.question.create({
        data: {
          quizId: quiz_id,
          question: item.question,
          answer: item.questionType === 'text' ? item.answer : '',
          questionType: item.questionType,
        },
      });

      // If it's MCQ, create the options
      if (item.questionType === 'mcq' && item.options) {
        if (item.options.length < 2) {
          throw new Error('MCQ must have at least two options.');
        }

        const correctOptions = item.options.filter((opt) => opt.isCorrect);
        if (correctOptions.length !== 1) {
          throw new Error('MCQ must have exactly one correct answer.');
        }

        await prisma.option.createMany({
          data: item.options.map((opt) => ({
            questionId: createdQuestion.id,
            label: opt.label,
            isCorrect: opt.isCorrect,
          })),
        });
      }

      return createdQuestion;
    });
    await Promise.all(added_Q);
    console.log('Questions added to the db!');
  } catch (error) {
    console.log('Error in add_questions: ', error);
    //  in case...delete the quiz >> so user can try again
    try {
      await prisma.quiz.delete({
        where: {
          id: quiz_id,
        },
      });
    } catch (e) {
      throw new Error('Error in deleting the quiz: ', e);
    }
  }
}

// init the quiz creation process
export async function add_quiz(
  ori_url: string,
  generated_url: string,
  user: { id: string },
  quiz_list: Question[],
  vertify_methods: 'questions' | 'otp' | 'both',
  otp_method?: 'mail' | 'sms'
) {
  try {
    // 1: vaidation
    console.log('verifying...');
    const user_quiz = await prisma.quiz.findFirst({
      where: {
        ownerId: user.id,
        original_url: ori_url,
      },
    });

    // CASE: there is a quiz for this url
    if (user_quiz) throw new Error('User already has a quiz for this url');

    // 2: Quiz creation
    console.log('Adding quiz to the db...');
    console.log('vertify_methods: ', vertify_methods);

    let generate_link: generate_link;

    // CASE: OTP quiz
    if (vertify_methods === 'otp') {
      console.log('OTP quiz');
      generate_link = await prisma.quiz.create({
        data: {
          url: generated_url,
          original_url: ori_url,
          ownerId: user.id,
          vertificationMethods: ['OTP'],
          OTPmethod: otp_method,
        },
      });

      // CASE: Questions quiz
    } else if (vertify_methods === 'questions') {
      console.log('Questions quiz');
      generate_link = await prisma.quiz.create({
        data: {
          url: generated_url,
          original_url: ori_url,
          vertificationMethods: ['QUESTIONS'],
          ownerId: user.id,
        },
      });

      // CASE: Both quiz
    } else {
      console.log('Dual quiz');
      generate_link = await prisma.quiz.create({
        data: {
          url: generated_url,
          original_url: ori_url,
          ownerId: user.id,
          vertificationMethods: ['OTP', 'QUESTIONS'],
          OTPmethod: otp_method,
        },
      });
    }
    // 3: Questions creation & adding
    console.log('Quiz added to the db! ');
    if (vertify_methods === 'questions' || vertify_methods === 'both') {
      console.log('Adding questions to the db...');
      add_questions(quiz_list, generate_link.id);
    }
  } catch (error) {
    throw new Error(error);
  }
}

export function get_Q(questions: any[]): Question[] {
  return questions.map((q) => {
    if (q.questionType !== 'mcq' && q.questionType !== 'text') {
      throw new Error(`Invalid question type: ${q.questionType}`);
    }

    // For MCQ questions, find the correct answer from options
    if (q.questionType === 'mcq') {
      const correctOption = q.options.find((opt: any) => opt.isCorrect);
      q.answer = correctOption ? correctOption.label : '';
    }

    return q as Question;
  });
}

// quiz deletion
export async function delete_quiz(quiz_id: string) {
  try {
    console.log('Deleting associated tables...');
    // 1: delete options (grand child)
    await prisma.option.deleteMany({
      where: {
        question: {
          quizId: quiz_id,
        },
      },
    });

    // 2: delete questions (child)
    await prisma.question.deleteMany({
      where: {
        quizId: quiz_id,
      },
    });

    console.log('Deleting quiz...');
    // 3: delete quiz (parent)
    await prisma.quiz.delete({
      where: {
        id: quiz_id,
      },
    });
  } catch (e) {
    console.error('Error in delete_quiz function:', e);
    throw new Error('Failed to delete quiz');
  }
}

export async function does_link_exist(url: string) {
  try {
    const exist = await prisma.quiz.findFirst({
      where: {
        url: url,
      },
    });
    return exist ? true : false;
  } catch (e) {
    console.error('Error in doesLinkExist: ', e);
    throw new Error('Error in doesLinkExist: ', e);
  }
}
type AttemptLog = {
  date: string;
  attempts: number;
  success_attempts: number;
};

export async function update_log(quiz_id: string, success: boolean) {
  try {
    console.log('Updating log...');

    const quiz = await prisma.quiz.findFirst({
      where: {
        id: quiz_id,
      },
    });

    // CASE: quiz not found
    if (!quiz) throw new Error('Quiz not found');

    // 1: prepare the log
    const log = (quiz.attempts_log as AttemptLog[]) || [];
    const last_attempt = quiz.lastAttemptAt;
    const currentDate = new Date().toISOString().split('T')[0]; // today's date
    let lastAttemptDate = last_attempt // last attempt date
      ? new Date(last_attempt).toISOString().split('T')[0]
      : null;

    const lastLog = log.find((entry) => entry.date === currentDate);
    let updatedLog: AttemptLog[];

    // CASE: last attempt was today, update the log
    if (lastLog)
      updatedLog = log.map((entry) =>
        entry.date === currentDate // find the entry for today
          ? {
              // update
              ...entry,
              attempts: entry.attempts + 1,
              success_attempts: success
                ? entry.success_attempts + 1
                : entry.success_attempts,
            }
          : entry
      );
    // CASE: first attempt of the day, add a new entry
    else
      updatedLog = [
        ...log,
        {
          date: currentDate,
          attempts: 1,
          success_attempts: success ? 1 : 0,
        },
      ];

    // 2: update the quiz with the new logs
    await prisma.quiz.update({
      where: {
        id: quiz_id,
      },
      data: {
        attempts_log: updatedLog,
        lastAttemptAt: new Date(),
        totalAttempts: quiz.totalAttempts + 1,
      },
    });

    console.log('Log updated successfully: ');
  } catch (error) {
    console.log('Error in update_log: ', error);
    throw new Error('Error in update_log: ', error);
  }
}

export async function toggole_statue(
  statue: 'activate' | 'deactivate',
  quiz_id: string
) {
  try {
    console.log('Toggling quiz status...');

    // find the quiz
    const quiz = await prisma.quiz.findFirst({
      where: {
        id: quiz_id,
      },
    });

    // CASE: quiz not found
    if (!quiz) {
      return {
        message: 'Quiz not found',
        status: 'not_found',
      };
    }

    console.log('Quiz found: ');

    // CASE: activate
    if (statue === 'activate') {
      await prisma.quiz.update({
        where: {
          id: quiz_id,
        },
        data: {
          status: 'active',
        },
      });

      console.log('Quiz activated successfully: ');
      return {
        message: 'Quiz activated successfully',
        status: 'success',
      };
    }

    // CASE: deactivate
    await prisma.quiz.update({
      where: {
        id: quiz_id,
      },
      data: {
        status: 'inactive',
      },
    });

    console.log('Quiz deactivated successfully: ');
    return {
      message: 'Quiz deactivated successfully',
      status: 'success',
    };
  } catch (error) {
    console.error('Error in toggole_statue: ', error);
    return {
      message: 'Error in toggole_statue',
      status: 'failed',
      error: error.message,
    };
  }
}
