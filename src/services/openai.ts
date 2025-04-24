import OpenAI from "openai";

import { OPENAI_CONTEXT } from "../constants.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export const createChatCompletion = async (prompt: string) => {
  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL!,
      messages: [
        { role: "system", content: OPENAI_CONTEXT },
        { role: "user", content: prompt },
      ],
    });

    // always return the first choice -- shouldn't be an issue...
    return completion.choices[0].message.content;
  } catch (error) {
    console.error("Error with OpenAI:", error);
    if (error instanceof Error) {
      throw new Error(error.message);
    }

    throw new Error("Error creating chat completion");
  }
};
