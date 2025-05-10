import { prisma, update_log } from '.';
import Twilio from 'twilio';

// pending, expired
// OTP is valid for 5 minutes

const client = Twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const twilioServiceID = process.env.TWILIO_SERVICE_SID;
if (!twilioServiceID) {
  console.error('Twilio Service ID is not defined');
  throw new Error('Twilio Service ID is not defined');
}

// its not in DB
export const available_OTP = async (generated_otp: string) => {
  try {
    const otp = await prisma.oTP.findFirst({
      where: {
        otp: generated_otp,
        status: 'pending',
      },
    });
    return otp ? false : true;
  } catch (error) {
    throw new Error(`Error in available_OTP: ${error.message}`);
  }
};

// push the OTP to the DB
export const store_OTP = async (
  generated_otp: string,
  user_contact: string
) => {
  try {
    // 1: push the OTP to the DB
    console.log('processing OTP...');

    // TODO: deActivatet any prev OTPs with the same contact
    await prisma.oTP.updateMany({
      where: {
        contact: user_contact.trim(),
        status: 'pending',
      },
      data: {
        status: 'expired',
      },
    });

    // 2: create a new OTP
    const stored_otp = await prisma.oTP.create({
      data: {
        otp: generated_otp.trim(),
        contact: user_contact.trim(),
        status: 'pending',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes from now
      },
    });
  } catch (error) {
    throw new Error(`Error in store_OTP: ${error.message}`);
  }
};

export const verify_OTP = async (otp_code: string, user_contact: string) => {
  // CASE : NUMBER >> CUSTOME OTP
  if (user_contact.length < 10) {
    // 1: check if the OTP is valid

    console.log(`otp_code: 966${otp_code}`);
    console.log('user_contact', user_contact);

    const otp = await prisma.oTP.findFirst({
      where: {
        otp: otp_code,
        contact: `966${user_contact}`,
      },
    });
    // CASE: OTP not found
    if (!otp)
      return {
        status: 'not_found',
      };

    // CASE: OTP expired
    if (otp.expiresAt < new Date() || otp.status === 'expired')
      return {
        status: 'expired',
      };

    // update the OTP
    await prisma.oTP.update({
      where: {
        id: otp.id,
      },
      data: {
        status: 'verified',
      },
    });
  }
  // CASE : EMAIL >> TWILIO OTP
  if (user_contact.includes('@')) {
    // 1: twilio verify the OTP
    const response = await client.verify.v2
      .services(twilioServiceID)
      .verificationChecks.create({ to: user_contact, code: otp_code });

    // CASE: OTP expired
    if (response.status === 'expired')
      return {
        status: 'expired',
      };

    // fallback
    // CASE: OTP not found
    if (!response.status) {
      console.log('response', response);
      return {
        status: 'not_found',
      };
    }
  }

  return {
    status: 'approved',
  };
};
