export { prisma } from './clinet.js';
export {
  validate_link,
  validate_link_by_id,
  get_user_quiz,
  add_questions,
  add_quiz,
  get_Q,
  delete_quiz,
  does_link_exist,
  update_log,
} from './quizes.js';

export { available_OTP, store_OTP, verify_OTP } from './OTP.ts';
