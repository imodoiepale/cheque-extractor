declare module 'intuit-oauth' {
    export interface OAuthConfig {
        clientId: string;
        clientSecret: string;
        environment: 'sandbox' | 'production';
        redirectUri: string;
    }

    export interface TokenResponse {
        access_token: string;
        refresh_token: string;
        token_type: string;
        expires_in: number;
        x_refresh_token_expires_in: number;
    }

    export default class OAuthClient {
        constructor(config: OAuthConfig);
        
        authorizeUri(params: {
            scope: string[];
            state: string;
        }): string;
        
        createToken(authorizationCode: string): Promise<TokenResponse>;
        
        refresh(): Promise<TokenResponse>;
        
        refreshUsingToken(refreshToken: string): Promise<TokenResponse>;
        
        getToken(): TokenResponse;
        
        setToken(token: TokenResponse): void;
        
        isAccessTokenValid(): boolean;
        
        getKeyFromJWKsURI(id_token: string, kid: string, request: any): Promise<any>;
    }
}
