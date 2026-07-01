import * as userRepository from "../repositories/user.repository";
import { UpdateUserInput, User } from "../types/user";
import { AppError } from "../types/errors";

export async function getUserById(id: string): Promise<User> {
  const user = await userRepository.findUserById(id);
  if (!user) {
    throw new AppError("USER_NOT_FOUND", `User with id ${id} was not found`);
  }
  return user;
}

export async function updateCurrentUser(id: string, patch: UpdateUserInput): Promise<User> {
  const updated = await userRepository.updateUser(id, patch);
  if (!updated) {
    throw new AppError("USER_NOT_FOUND", `User with id ${id} was not found`);
  }
  return updated;
}
