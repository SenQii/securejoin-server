import { jwtDecode } from 'jwt-decode';
import { prisma } from '../DB';
import { JWTPayload } from '../types';

// is user logged in?
export function get_user_data_from_access_token(access_Token: string) {
  const user = {
    id: jwtDecode(access_Token).sub || '',
    email: (jwtDecode(access_Token) as JWTPayload).user_email,
    username: (jwtDecode(access_Token) as JWTPayload).user_name,
  };
  return user;
}

// user existing
export async function check_existing_user(
  id: string,
  mail: string,
  name: string
) {
  try {
    const user = await prisma.user.findUnique({
      where: {
        id: id,
      },
    });
    if (user) return user;

    // CASE: new user
    console.log('new user, will be added to the db...');
    const new_user = await prisma.user.create({
      data: {
        id: id,
        email: mail,
        name: name,
      },
    });

    console.log('New user added to the db! ', new_user);
  } catch (e) {
    throw new Error(`Error in check_existing_user: ${e.message}`);
  }
}
