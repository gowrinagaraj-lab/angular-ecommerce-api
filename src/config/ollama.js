const BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL || "llama3.1";

const chat = async ({ messages, tools }) => {
    const response = await fetch(`${BASE_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: MODEL,
            messages,
            tools,
            stream: false
        })
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Ollama request failed (${response.status}): ${errorBody}`);
    }

    return response.json();
};

module.exports = { chat, MODEL, BASE_URL };
