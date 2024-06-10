import { VerbalWebError } from "../shared/error";
import { ChatServerConfig } from "./ChatServer";
import { OAuth2Client } from "google-auth-library";

const googleClient = new OAuth2Client();

export async function checkGoogleAuthRequest(config: ChatServerConfig, token: string): Promise<string> {
    if (!config.googleOAuthClientId) {
        throw new VerbalWebError("Google authentication not enabled");
    }
    const ticket = await googleClient.verifyIdToken({
        idToken: token,
        audience: config.googleOAuthClientId,
    });
    const user = ticket.getPayload()?.email;
    if (!user) throw new VerbalWebError("Google user email not available");
    return user;
}
