import OAuthClient from 'intuit-oauth';
import supabase from '../../../database/supabaseClient';
import logger from '../../../utils/logger';
import { ExportError } from '../../../utils/errors';

const QBO_CLIENT_ID = process.env.QBO_CLIENT_ID!;
const QBO_CLIENT_SECRET = process.env.QBO_CLIENT_SECRET!;
const QBO_ENVIRONMENT = process.env.QBO_ENVIRONMENT || 'sandbox';
const QBO_REDIRECT_URI = process.env.QBO_REDIRECT_URI || 'http://localhost:3000/api/qbo/callback';

export class QuickBooksOAuthClient {
    private oauthClient: OAuthClient;

    constructor() {
        this.oauthClient = new OAuthClient({
            clientId: QBO_CLIENT_ID,
            clientSecret: QBO_CLIENT_SECRET,
            environment: QBO_ENVIRONMENT,
            redirectUri: QBO_REDIRECT_URI,
        });
    }

    getAuthorizationUrl(state: string): string {
        return this.oauthClient.authorizeUri({
            scope: [OAuthClient.scopes.Accounting],
            state,
        });
    }

    async getTokenFromCode(code: string, realmId: string) {
        try {
            const authResponse = await this.oauthClient.createToken(code);

            return {
                accessToken: authResponse.token.access_token,
                refreshToken: authResponse.token.refresh_token,
                expiresAt: new Date(Date.now() + authResponse.token.expires_in * 1000),
                realmId,
            };
        } catch (error) {
            logger.error({ error }, 'Failed to exchange OAuth code for token');
            throw new ExportError('OAuth token exchange failed', error);
        }
    }

    async refreshAccessToken(tenantId: string) {
        try {
            // Get current connection
            const { data: connection, error } = await supabase
                .from('qbo_connections')
                .select('*')
                .eq('tenant_id', tenantId)
                .eq('status', 'active')
                .single();

            if (error || !connection) {
                throw new ExportError('No active QuickBooks connection found');
            }

            // Set tokens
            this.oauthClient.setToken({
                access_token: connection.access_token,
                refresh_token: connection.refresh_token,
            });

            // Refresh
            const authResponse = await this.oauthClient.refresh();

            // Update in database
            await supabase
                .from('qbo_connections')
                .update({
                    access_token: authResponse.token.access_token,
                    refresh_token: authResponse.token.refresh_token,
                    access_token_expires_at: new Date(Date.now() + authResponse.token.expires_in * 1000),
                    updated_at: new Date().toISOString(),
                })
                .eq('id', connection.id);

            logger.info({ tenantId }, 'Access token refreshed');

            return authResponse.token.access_token;
        } catch (error) {
            logger.error({ error, tenantId }, 'Failed to refresh access token');
            throw new ExportError('Token refresh failed', error);
        }
    }

    async getValidAccessToken(tenantId: string): Promise<string> {
        const { data: connection } = await supabase
            .from('qbo_connections')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('status', 'active')
            .single();

        if (!connection) {
            throw new ExportError('No active QuickBooks connection');
        }

        // Check if token is expired
        const expiresAt = new Date(connection.access_token_expires_at);
        const now = new Date();

        if (expiresAt <= now) {
            // Token expired, refresh it
            return await this.refreshAccessToken(tenantId);
        }

        return connection.access_token;
    }
}

export const qboOAuthClient = new QuickBooksOAuthClient();