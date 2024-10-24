import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { jwtDecode } from 'jwt-decode';

const app = express();
const port = process.env.PORT || 3000;
const prisma = new PrismaClient();

app.use(
  cors({
    origin: 'http://localhost:5173',
  })
);
app.use(express.json());

// EP
app.post('/create_link', async (req, res) => {
  try {
    const { quiz_list, original_url } = req.body;

    // auth check
    const access_Token = req.headers['access-token'];
    const user = get_user_data_from_access_token(access_Token);

    console.log('user: ', user.id);
    console.log('original_url: ', original_url);
    console.log('quiz_list: ', quiz_list);

    // any missing data check
    if (!original_url || !quiz_list) {
      return res.status(400).json({
        error: 'Invalid body request',
      });
    }

    // handling new users
    const userExists = await check_existing_user(
      user.id,
      user.email,
      user.username
    );
    const generatedURL = `https://securejoin.com/${Math.random()
      .toString(36)
      .substring(2, 11)}`;

    await add_quiz(original_url, generatedURL, user, quiz_list);

    const user_quiz = await get_user_quiz(user.id);

    res.status(200).json({
      status: 'success',
      message: 'Link created successfully',
      link: generatedURL,
    });
  } catch (e) {
    console.log('Err in create_link: ', e);
    res.status(500).json({
      error: 'Internal Server Error',
    });
  }
});

app.listen(port, () => {
  console.log('running at ' + port);
});

async function get_user_quiz(user_id) {
  try {
    const user_quiz = await prisma.quiz.findMany({
      where: {
        ownerId: user_id,
      },
    });

    console.log('ur quizez: ', user_quiz);
  } catch (e) {
    console.log('Error in get_user_quiz: ', e);
  }
}

async function add_questions(quiz_list, quiz_id) {
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
    // await Promise.all(added_Q);
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
      console.log('Error in deleting the quiz: ', e);
    }
  }
}

async function add_quiz(ori_url, generated_url, user, quiz_list) {
  try {
    console.log('verifying if the user already has a quiz for this url...');
    const user_quiz = await prisma.quiz.findFirst({
      where: {
        ownerId: user.id,
        original_url: ori_url,
      },
    });

    if (user_quiz) throw new Error('User already has a quiz for this url');

    console.log('Adding quiz to the db...');
    const generate_link = await prisma.quiz.create({
      data: {
        url: generated_url,
        original_url: ori_url,
        ownerId: user.id,
      },
    });

    console.log('Quiz added to the db! ');
    console.log('Adding questions to the db...');
    add_questions(quiz_list, generate_link.id);
  } catch (error) {
    console.log('Error in add_quiz: ', error);
  }
}

async function check_existing_user(id, mail, name) {
  try {
    const user = await prisma.user.findUnique({
      where: {
        id: id,
      },
    });

    if (user) {
      return user;
    }

    console.log('new user, will be added to the db...');
    const new_user = await prisma.user.create({
      data: {
        id: id,
        email: mail,
        name: name,
      },
    });

    if (new_user) console.log('New user added to the db! ', new_user);
  } catch (e) {
    console.log('Error in check_existing_user: ', e);
  }
}

function get_user_data_from_access_token(access_Token) {
  const user = {
    id: jwtDecode(access_Token).sub,
    email: jwtDecode(access_Token).user_email,
    username: jwtDecode(access_Token).user_name,
  };
  return user;
}
