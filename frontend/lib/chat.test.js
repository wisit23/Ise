import { participantRoleLabel, otherParticipant } from "./chat";

describe("participantRoleLabel", () => {
  it("labels every role the Participant schema documents", () => {
    // Mirrors chat-service's schema.prisma comment:
    // role String // BUYER | SELLER | AGENT | ADMIN | SYSTEM
    expect(participantRoleLabel("BUYER")).toBe("ผู้ซื้อ");
    expect(participantRoleLabel("SELLER")).toBe("ร้านค้า");
    expect(participantRoleLabel("AGENT")).toBe("ฝ่ายบริการลูกค้า");
    expect(participantRoleLabel("ADMIN")).toBe("ผู้ดูแลระบบ");
    expect(participantRoleLabel("SYSTEM")).toBe("ระบบ");
  });

  it("returns null for a role it doesn't recognise, rather than the raw enum", () => {
    // A role added elsewhere later must show NO badge here — leaking
    // "MODERATOR" into a Thai UI is worse than showing nothing.
    expect(participantRoleLabel("MODERATOR")).toBeNull();
    expect(participantRoleLabel(undefined)).toBeNull();
    expect(participantRoleLabel(null)).toBeNull();
    expect(participantRoleLabel("")).toBeNull();
  });

  it("is not confused by a lowercase or differently-cased value", () => {
    expect(participantRoleLabel("seller")).toBeNull();
  });
});

describe("otherParticipant + role together", () => {
  // The point of reading Participant.role rather than the user's account
  // role: the SAME person is the seller in one room and the buyer in
  // another, which an account-level role cannot express.
  const person = "user-both";

  it("reports the role held in each specific room", () => {
    const sellingRoom = {
      participants: [
        { userId: "buyer-1", role: "BUYER" },
        { userId: person, role: "SELLER" },
      ],
    };
    const buyingRoom = {
      participants: [
        { userId: person, role: "BUYER" },
        { userId: "shop-9", role: "SELLER" },
      ],
    };

    expect(
      participantRoleLabel(otherParticipant(sellingRoom, "buyer-1").role),
    ).toBe("ร้านค้า");
    expect(
      participantRoleLabel(otherParticipant(buyingRoom, "shop-9").role),
    ).toBe("ผู้ซื้อ");
  });
});
