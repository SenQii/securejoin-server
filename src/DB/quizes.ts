import { prisma } from '.';
import { Question, SimpleQuestion } from '../types';

// is the link valid?
export async function validate_link(link: string) {
  try {
    const quiz = await prisma.quiz.findFirst({
      where: {
        url: link,
      },
      include: {
        questions: true,
      },
    });
    // CASE : quiz not found
    if (!quiz) throw new Error('Quiz not found');
    return quiz;
  } catch (e) {
    throw new Error(`Error in validate_link: ${e.message}`);
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
export async function add_questions(
  quiz_list: SimpleQuestion[],
  quiz_id: string
) {
  try {
    // per question, add them to the db
    console.log('Adding questions to the db...');

    const added_Q = quiz_list.map(async (item) => {
      await prisma.question.create({
        data: {
          quizId: quiz_id,
          quistion: item.question,
          answer: item.answer,
        },
      });
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
  quiz_list: SimpleQuestion[]
) {
  try {
    // Validate URLs >> already handled in FE, but in case
    if (!ori_url.startsWith('http')) {
      throw new Error('Invalid original URL format');
    }
    if (!generated_url.startsWith('https://securejoin.com/')) {
      throw new Error('Invalid generated URL format');
    }

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
    const generate_link = await prisma.quiz.create({
      data: {
        url: generated_url,
        original_url: ori_url,
        ownerId: user.id,
      },
    });

    // 3: Questions creation & adding
    console.log('Quiz added to the db! ');
    console.log('Adding questions to the db...');
    add_questions(quiz_list, generate_link.id);
  } catch (error) {
    throw new Error(error);
  }
}

export function get_Q(questions: Question[]): SimpleQuestion[] {
  return questions.map((item) => ({
    question: item.quistion,
    answer: item.answer,
  }));
}
