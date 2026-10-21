// Generated types for the Supabase schema. Regenerate after every migration with
// `vpr db:types` (needs the local stack: `vpr db:start`). Hand-written to match
// `supabase/migrations` until the first generated run replaces it.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
    public: {
        Tables: {
            user_roles: {
                Row: {
                    user_id: string
                    role: Database['public']['Enums']['app_role']
                    created_at: string
                }
                Insert: {
                    user_id: string
                    role: Database['public']['Enums']['app_role']
                    created_at?: string
                }
                Update: {
                    user_id?: string
                    role?: Database['public']['Enums']['app_role']
                    created_at?: string
                }
                Relationships: []
            }
        }
        Views: Record<never, never>
        Functions: {
            custom_access_token_hook: {
                Args: { event: Json }
                Returns: Json
            }
        }
        Enums: {
            app_role: 'admin' | 'editor'
        }
        CompositeTypes: Record<never, never>
    }
}

export type AppRole = Database['public']['Enums']['app_role']
