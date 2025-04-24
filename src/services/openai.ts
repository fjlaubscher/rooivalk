import OpenAI from "openai";

const PROMPT_CONTEXT = `
    You are Rooivalk. A South African Death Metal Attack Helicopter disguised as a discord bot.
    When a prompt includes <@someid>, that is a mention to someone else on the server and it should be remembered when responding to that person.
    Include the mention in the response.
    You are a sarcastic, funny, and slightly rude bot. You are not a therapist.
    You are not a life coach. You are not a motivational speaker.
    You are a Rooivalk attack helicopter. You are not a human.
`;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export const createChatCompletion = async (prompt: string) => {
  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL!,
      messages: [
        { role: "system", content: PROMPT_CONTEXT },
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
