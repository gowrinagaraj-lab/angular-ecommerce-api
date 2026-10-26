const mongoose = require("mongoose");

/*
Run `work(session)` inside a MongoDB transaction when the server supports
one (replica set, mongos, Atlas). A standalone mongod — the default local
Windows install — rejects transactions, so there `work(null)` runs without
one: same queries, but the writes are no longer all-or-nothing. A warning
is logged once so this never goes unnoticed outside local development.

`work` may be called more than once (the driver retries transient
transaction errors), so it must not depend on state from a previous call.
*/

let transactionSupport;
let warnedStandalone = false;

const supportsTransactions = () => {
    if (!transactionSupport) {
        transactionSupport = mongoose.connection.db.admin()
            .command({ hello: 1 })
            .then((hello) => Boolean(hello.setName) || hello.msg === "isdbgrid")
            .catch((error) => {
                transactionSupport = undefined;
                throw error;
            });
    }

    return transactionSupport;
};

const runInTransaction = async (work) => {
    if (!(await supportsTransactions())) {
        if (!warnedStandalone) {
            warnedStandalone = true;
            console.warn(
                "MongoDB is running standalone: multi-document writes run WITHOUT transactions. " +
                "Use a replica set or Atlas outside local development."
            );
        }

        return work(null);
    }

    const session = await mongoose.startSession();

    try {
        let result;

        await session.withTransaction(async () => {
            result = await work(session);
        });

        return result;
    } finally {
        await session.endSession();
    }
};

module.exports = runInTransaction;
