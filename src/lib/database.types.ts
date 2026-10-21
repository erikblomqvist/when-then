export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
    public: {
        Tables: {
            role_audit: {
                Row: {
                    action: string
                    actor_id: string | null
                    after: Json | null
                    at: string
                    before: Json | null
                    entity: string
                    entity_id: string
                    id: number
                }
                Insert: {
                    action: string
                    actor_id?: string | null
                    after?: Json | null
                    at?: string
                    before?: Json | null
                    entity: string
                    entity_id: string
                    id?: never
                }
                Update: {
                    action?: string
                    actor_id?: string | null
                    after?: Json | null
                    at?: string
                    before?: Json | null
                    entity?: string
                    entity_id?: string
                    id?: never
                }
                Relationships: []
            }
            role_invites: {
                Row: {
                    created_at: string
                    email: string
                    invited_by: string | null
                    role: Database['public']['Enums']['app_role']
                }
                Insert: {
                    created_at?: string
                    email: string
                    invited_by?: string | null
                    role: Database['public']['Enums']['app_role']
                }
                Update: {
                    created_at?: string
                    email?: string
                    invited_by?: string | null
                    role?: Database['public']['Enums']['app_role']
                }
                Relationships: []
            }
            user_roles: {
                Row: {
                    created_at: string
                    role: Database['public']['Enums']['app_role']
                    user_id: string
                }
                Insert: {
                    created_at?: string
                    role: Database['public']['Enums']['app_role']
                    user_id: string
                }
                Update: {
                    created_at?: string
                    role?: Database['public']['Enums']['app_role']
                    user_id?: string
                }
                Relationships: []
            }
        }
        Views: {
            [_ in never]: never
        }
        Functions: {
            audit_role_change: {
                Args: {
                    action: string
                    actor_id: string
                    after: Json
                    before: Json
                    entity: string
                    entity_id: string
                }
                Returns: undefined
            }
            custom_access_token_hook: { Args: { event: Json }; Returns: Json }
            invite_person: {
                Args: {
                    actor_id: string
                    email: string
                    role: Database['public']['Enums']['app_role']
                }
                Returns: string
            }
            is_google_user: { Args: { app_metadata: Json }; Returns: boolean }
            list_people: {
                Args: never
                Returns: {
                    email: string
                    granted_at: string
                    role: Database['public']['Enums']['app_role']
                    user_id: string
                }[]
            }
            require_admin: { Args: { actor_id: string }; Returns: undefined }
            set_invite_role: {
                Args: {
                    actor_id: string
                    invite_email: string
                    new_role?: Database['public']['Enums']['app_role']
                }
                Returns: undefined
            }
            set_person_role: {
                Args: {
                    actor_id: string
                    new_role?: Database['public']['Enums']['app_role']
                    person_id: string
                }
                Returns: undefined
            }
        }
        Enums: {
            app_role: 'admin' | 'editor'
        }
        CompositeTypes: {
            [_ in never]: never
        }
    }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
    DefaultSchemaTableNameOrOptions extends
        | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
        | { schema: keyof DatabaseWithoutInternals },
    TableName extends (DefaultSchemaTableNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals
    }
        ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
              DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
        : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
}
    ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
          DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
          Row: infer R
      }
        ? R
        : never
    : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
            DefaultSchema['Views'])
      ? (DefaultSchema['Tables'] &
            DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
            Row: infer R
        }
          ? R
          : never
      : never

export type TablesInsert<
    DefaultSchemaTableNameOrOptions extends
        | keyof DefaultSchema['Tables']
        | { schema: keyof DatabaseWithoutInternals },
    TableName extends (DefaultSchemaTableNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals
    }
        ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
        : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
}
    ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
          Insert: infer I
      }
        ? I
        : never
    : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
      ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
            Insert: infer I
        }
          ? I
          : never
      : never

export type TablesUpdate<
    DefaultSchemaTableNameOrOptions extends
        | keyof DefaultSchema['Tables']
        | { schema: keyof DatabaseWithoutInternals },
    TableName extends (DefaultSchemaTableNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals
    }
        ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
        : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
}
    ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
          Update: infer U
      }
        ? U
        : never
    : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
      ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
            Update: infer U
        }
          ? U
          : never
      : never

export type Enums<
    DefaultSchemaEnumNameOrOptions extends
        | keyof DefaultSchema['Enums']
        | { schema: keyof DatabaseWithoutInternals },
    EnumName extends (DefaultSchemaEnumNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals
    }
        ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
        : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
}
    ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
    : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
      ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
      : never

export type CompositeTypes<
    PublicCompositeTypeNameOrOptions extends
        | keyof DefaultSchema['CompositeTypes']
        | { schema: keyof DatabaseWithoutInternals },
    CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals
    }
        ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
        : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
}
    ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
    : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
      ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
      : never

export const Constants = {
    public: {
        Enums: {
            app_role: ['admin', 'editor'],
        },
    },
} as const
