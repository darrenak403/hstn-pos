import { AuthService } from "./auth.service";

describe("AuthService.logout", () => {
  it("revokes every refresh-token family for the authenticated user's device", async () => {
    const refreshTokens = { revokeAllForDevice: jest.fn().mockResolvedValue(undefined) };
    const auditLog = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new AuthService({} as never, {} as never, refreshTokens as never, auditLog as never);

    await service.logout("user-1", "device-1");

    expect(refreshTokens.revokeAllForDevice).toHaveBeenCalledWith("user-1", "device-1", "LOGOUT");
    expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({
      category: "SECURITY",
      action: "LOGOUT",
      actorId: "user-1",
      deviceId: "device-1",
    }));
  });
});
