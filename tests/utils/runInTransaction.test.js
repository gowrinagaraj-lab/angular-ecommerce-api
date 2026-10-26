jest.mock("mongoose", () => ({
    connection: { db: { admin: jest.fn() } },
    startSession: jest.fn()
}));

const loadHelper = (hello) => {
    jest.resetModules();
    const mongoose = require("mongoose");
    const command = jest.fn().mockResolvedValue(hello);
    mongoose.connection.db.admin.mockReturnValue({ command });

    const session = {
        withTransaction: jest.fn(async (fn) => fn()),
        endSession: jest.fn().mockResolvedValue()
    };
    mongoose.startSession.mockResolvedValue(session);

    return { runInTransaction: require("../../src/utils/runInTransaction"), mongoose, command, session };
};

describe("runInTransaction", () => {

    it("runs the work inside a transaction on a replica set", async () => {
        const { runInTransaction, session } = loadHelper({ setName: "rs0" });
        const work = jest.fn().mockResolvedValue("done");

        const result = await runInTransaction(work);

        expect(result).toBe("done");
        expect(work).toHaveBeenCalledWith(session);
        expect(session.withTransaction).toHaveBeenCalled();
        expect(session.endSession).toHaveBeenCalled();
    });

    it("ends the session when the work throws", async () => {
        const { runInTransaction, session } = loadHelper({ setName: "rs0" });

        await expect(runInTransaction(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
        expect(session.endSession).toHaveBeenCalled();
    });

    it("runs the work without a session on a standalone server and warns once", async () => {
        const { runInTransaction, mongoose, command } = loadHelper({ isWritablePrimary: true });
        const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
        const work = jest.fn().mockResolvedValue("done");

        await runInTransaction(work);
        await runInTransaction(work);

        expect(work).toHaveBeenCalledWith(null);
        expect(mongoose.startSession).not.toHaveBeenCalled();
        expect(command).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });

});
