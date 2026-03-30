import bcrypt from "bcrypt";

const MIN_PASSWORD_LENGTH = 15 as const;
const MAX_PASSWORD_LENGTH = 1024 as const;

export function checkPasswordStrength(password: string): void {
    if (password.length < MIN_PASSWORD_LENGTH) {
        throw new Error("Password must be at least 15 characters");
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
        throw new Error("Password must be at most 1024 characters");
    }
}

export async function checkPassword(
  inputPassword: string,
  dbPassword: string
): Promise<boolean> {
  return await bcrypt.compare(inputPassword, dbPassword);
}

export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;

  return await bcrypt.hash(password, saltRounds);
}