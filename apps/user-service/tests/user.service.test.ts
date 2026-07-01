jest.mock("../src/repositories/user.repository", () => ({
  findUserById: jest.fn(),
  updateUser: jest.fn(),
}));

import * as userRepository from "../src/repositories/user.repository";
import { getUserById, updateCurrentUser } from "../src/services/user.service";
import { User } from "../src/types/user";

const mockedRepo = userRepository as unknown as {
  findUserById: jest.Mock;
  updateUser: jest.Mock;
};

const sampleUser: User = {
  id: "11111111-1111-4111-8111-111111111111",
  phone_number: "+919876543210",
  email: null,
  name: "Ravi Kumar",
  preferred_language: "en",
  city: "Hyderabad",
  vehicle_type: "bike",
  active_platforms: ["rapido"],
  active_domains: ["ride_hailing"],
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("user.service", () => {
  describe("getUserById", () => {
    it("returns the user when found", async () => {
      mockedRepo.findUserById.mockResolvedValue(sampleUser);
      const result = await getUserById(sampleUser.id);
      expect(result).toEqual(sampleUser);
    });

    it("throws USER_NOT_FOUND when missing", async () => {
      mockedRepo.findUserById.mockResolvedValue(null);
      await expect(getUserById("missing-id")).rejects.toMatchObject({ code: "USER_NOT_FOUND" });
    });
  });

  describe("updateCurrentUser", () => {
    it("returns the updated user", async () => {
      const updated = { ...sampleUser, city: "Chennai" };
      mockedRepo.updateUser.mockResolvedValue(updated);
      const result = await updateCurrentUser(sampleUser.id, { city: "Chennai" });
      expect(result.city).toBe("Chennai");
      expect(mockedRepo.updateUser).toHaveBeenCalledWith(sampleUser.id, { city: "Chennai" });
    });

    it("throws USER_NOT_FOUND when the user doesn't exist", async () => {
      mockedRepo.updateUser.mockResolvedValue(null);
      await expect(updateCurrentUser("missing-id", { city: "Chennai" })).rejects.toMatchObject({
        code: "USER_NOT_FOUND",
      });
    });
  });
});
