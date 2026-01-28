import OAuthClient from 'intuit-oauth';
import { supabase } from '../../../database/supabaseClient';
import logger from '../../../utils/logger';
import { ExportError } from '../../../utils/errors';

const QBO_CLIENT_ID = process.env.QBO_CLIENT_ID;
const QBO_CLIENT_SECRET = process.env.QBO_CLIENT_SECRET;
const QBO_ENVIRONMENT = (process.env.QBO_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production';
const QBO_REDIRECT_URI = process.env.QBO_REDIRECT_URI || 'http://localhost:3000/api/qbo/callback';

export class QuickBooksOAuthClient {
    private oauthClient: OAuthClient | null = null;
    private credentialsConfigured: boolean;

    constructor() {
        this.credentialsConfigured = !!(QBO_CLIENT_ID && QBO_CLIENT_SECRET);
        
        if (this.credentialsConfigured) {
            try {
                this.oauthClient = new OAuthClient({
                    clientId: QBO_CLIENT_ID!,
                    clientSecret: QBO_CLIENT_SECRET!,
                    environment: QBO_ENVIRONMENT,
                    redirectUri: QBO_REDIRECT_URI,
                });
                logger.info('QuickBooks OAuth client initialized');
            } catch (error) {
                logger.warn({ error }, 'Failed to initialize QuickBooks OAuth client');
                this.credentialsConfigured = false;
            }
        } else {
            logger.info('QuickBooks credentials not configured - OAuth features disabled');
        }
    }

    isConfigured(): boolean {
        return this.credentialsConfigured;
    }

    getAuthorizationUrl(state: string): string {
        if (!this.oauthClient) {
            throw new Error('QuickBooks credentials not configured');
        }
        return this.oauthClient.authorizeUri({
            scope: ['com.intuit.quickbooks.accounting'],
            state,
        });
    }

    async getTokenFromCode(code: string, realmId: string) {
        if (!this.oauthClient) {
            throw new Error('QuickBooks credentials not configured');
        }
        try {
            const authResponse = await this.oauthClient.createToken(code);

            return {
                accessToken: authResponse.access_token,
                refreshToken: authResponse.refresh_token,
                expiresAt: new Date(Date.now() + authResponse.expires_in * 1000),
                realmId,
            };
        } catch (error) {
            logger.error({ error }, 'Failed to exchange OAuth code for token');
            throw new ExportError('OAuth token exchange failed', error);
        }
    }

    async refreshAccessToken(tenantId: string) {
        if (!this.oauthClient) {
            throw new Error('QuickBooks credentials not configured');
        }
        try {
            // Get current connection
            const { data: connection, error } = await supabase
                .from('qbo_connections')
                .select('*')
                .eq('tenant_id', tenantId)
                .eq('status', 'active')
                .single();

            if (error || !connection) {
                throw new ExportError('No active QuickBooks connection found', error);
            }

            // Set tokens
            this.oauthClient.setToken({
                access_token: connection.access_token,
                refresh_token: connection.refresh_token,
                token_type: 'bearer',
                expires_in: 3600,
                x_refresh_token_expires_in: 8726400,
            });

            // Refresh
            const authResponse = await this.oauthClient.refresh();

            // Update in database
            await supabase
                .from('qbo_connections')
                .update({
                    access_token: authResponse.access_token,
                    refresh_token: authResponse.refresh_token,
                    access_token_expires_at: new Date(Date.now() + authResponse.expires_in * 1000),
                    updated_at: new Date().toISOString(),
                })
                .eq('id', connection.id);

            logger.info({ tenantId }, 'Access token refreshed');

            return authResponse.access_token;
        } catch (error) {
            logger.error({ error, tenantId }, 'Failed to refresh access token');
            throw new ExportError('Token refresh failed', error);
        }
    }

    async getValidAccessToken(tenantId: string): Promise<string> {
        if (!this.oauthClient) {
            throw new Error('QuickBooks credentials not configured');
        }
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