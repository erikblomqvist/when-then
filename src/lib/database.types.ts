export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
    public: {
        Tables: {
            audit_log: {
                Row: {
                    action: string
                    actor_id: string | null
                    after: Json | null
                    at: string
                    before: Json | null
                    details: Json | null
                    entity: string
                    entity_id: string
                    id: number
                    locale: Database['public']['Enums']['card_locale'] | null
                }
                Insert: {
                    action: string
                    actor_id?: string | null
                    after?: Json | null
                    at?: string
                    before?: Json | null
                    details?: Json | null
                    entity: string
                    entity_id: string
                    id?: never
                    locale?: Database['public']['Enums']['card_locale'] | null
                }
                Update: {
                    action?: string
                    actor_id?: string | null
                    after?: Json | null
                    at?: string
                    before?: Json | null
                    details?: Json | null
                    entity?: string
                    entity_id?: string
                    id?: never
                    locale?: Database['public']['Enums']['card_locale'] | null
                }
                Relationships: []
            }
            card_translations: {
                Row: {
                    card_id: string
                    created_at: string
                    created_by: string | null
                    locale: Database['public']['Enums']['card_locale']
                    note: string | null
                    status: Database['public']['Enums']['translation_status']
                    text: string
                    updated_at: string
                    updated_by: string | null
                }
                Insert: {
                    card_id: string
                    created_at?: string
                    created_by?: string | null
                    locale: Database['public']['Enums']['card_locale']
                    note?: string | null
                    status?: Database['public']['Enums']['translation_status']
                    text: string
                    updated_at?: string
                    updated_by?: string | null
                }
                Update: {
                    card_id?: string
                    created_at?: string
                    created_by?: string | null
                    locale?: Database['public']['Enums']['card_locale']
                    note?: string | null
                    status?: Database['public']['Enums']['translation_status']
                    text?: string
                    updated_at?: string
                    updated_by?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: 'card_translations_card_id_fkey'
                        columns: ['card_id']
                        isOneToOne: false
                        referencedRelation: 'cards'
                        referencedColumns: ['id']
                    },
                ]
            }
            cards: {
                Row: {
                    archived_at: string | null
                    archived_by: string | null
                    archived_from: Database['public']['Enums']['card_status'] | null
                    category_id: string
                    created_at: string
                    created_by: string | null
                    day: number | null
                    decade: number | null
                    difficulty: number | null
                    id: string
                    month: number | null
                    source_quote: string | null
                    source_url: string | null
                    status: Database['public']['Enums']['card_status']
                    tags: string[]
                    updated_at: string
                    updated_by: string | null
                    verified_at: string | null
                    verified_by: string | null
                    year: number | null
                }
                Insert: {
                    archived_at?: string | null
                    archived_by?: string | null
                    archived_from?: Database['public']['Enums']['card_status'] | null
                    category_id: string
                    created_at?: string
                    created_by?: string | null
                    day?: number | null
                    decade?: number | null
                    difficulty?: number | null
                    id?: string
                    month?: number | null
                    source_quote?: string | null
                    source_url?: string | null
                    status?: Database['public']['Enums']['card_status']
                    tags?: string[]
                    updated_at?: string
                    updated_by?: string | null
                    verified_at?: string | null
                    verified_by?: string | null
                    year?: number | null
                }
                Update: {
                    archived_at?: string | null
                    archived_by?: string | null
                    archived_from?: Database['public']['Enums']['card_status'] | null
                    category_id?: string
                    created_at?: string
                    created_by?: string | null
                    day?: number | null
                    decade?: number | null
                    difficulty?: number | null
                    id?: string
                    month?: number | null
                    source_quote?: string | null
                    source_url?: string | null
                    status?: Database['public']['Enums']['card_status']
                    tags?: string[]
                    updated_at?: string
                    updated_by?: string | null
                    verified_at?: string | null
                    verified_by?: string | null
                    year?: number | null
                }
                Relationships: [
                    {
                        foreignKeyName: 'cards_category_id_fkey'
                        columns: ['category_id']
                        isOneToOne: false
                        referencedRelation: 'categories'
                        referencedColumns: ['id']
                    },
                ]
            }
            categories: {
                Row: {
                    archived_at: string | null
                    archived_by: string | null
                    colour: string
                    created_at: string
                    created_by: string | null
                    icon: string
                    id: string
                    position: number
                    updated_at: string
                    updated_by: string | null
                }
                Insert: {
                    archived_at?: string | null
                    archived_by?: string | null
                    colour: string
                    created_at?: string
                    created_by?: string | null
                    icon: string
                    id?: string
                    position: number
                    updated_at?: string
                    updated_by?: string | null
                }
                Update: {
                    archived_at?: string | null
                    archived_by?: string | null
                    colour?: string
                    created_at?: string
                    created_by?: string | null
                    icon?: string
                    id?: string
                    position?: number
                    updated_at?: string
                    updated_by?: string | null
                }
                Relationships: []
            }
            category_translations: {
                Row: {
                    category_id: string
                    created_at: string
                    created_by: string | null
                    locale: Database['public']['Enums']['card_locale']
                    name: string
                    status: Database['public']['Enums']['translation_status']
                    updated_at: string
                    updated_by: string | null
                }
                Insert: {
                    category_id: string
                    created_at?: string
                    created_by?: string | null
                    locale: Database['public']['Enums']['card_locale']
                    name: string
                    status?: Database['public']['Enums']['translation_status']
                    updated_at?: string
                    updated_by?: string | null
                }
                Update: {
                    category_id?: string
                    created_at?: string
                    created_by?: string | null
                    locale?: Database['public']['Enums']['card_locale']
                    name?: string
                    status?: Database['public']['Enums']['translation_status']
                    updated_at?: string
                    updated_by?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: 'category_translations_category_id_fkey'
                        columns: ['category_id']
                        isOneToOne: false
                        referencedRelation: 'categories'
                        referencedColumns: ['id']
                    },
                ]
            }
            game_players: {
                Row: {
                    game_id: string
                    icon: string
                    is_host: boolean
                    joined_at: string
                    name: string
                    seat_id: string
                    user_id: string
                }
                Insert: {
                    game_id: string
                    icon: string
                    is_host?: boolean
                    joined_at?: string
                    name: string
                    seat_id?: string
                    user_id: string
                }
                Update: {
                    game_id?: string
                    icon?: string
                    is_host?: boolean
                    joined_at?: string
                    name?: string
                    seat_id?: string
                    user_id?: string
                }
                Relationships: [
                    {
                        foreignKeyName: 'game_players_game_id_fkey'
                        columns: ['game_id']
                        isOneToOne: false
                        referencedRelation: 'games'
                        referencedColumns: ['id']
                    },
                ]
            }
            game_removals: {
                Row: {
                    game_id: string
                    removed_at: string
                    user_id: string
                }
                Insert: {
                    game_id: string
                    removed_at?: string
                    user_id: string
                }
                Update: {
                    game_id?: string
                    removed_at?: string
                    user_id?: string
                }
                Relationships: [
                    {
                        foreignKeyName: 'game_removals_game_id_fkey'
                        columns: ['game_id']
                        isOneToOne: false
                        referencedRelation: 'games'
                        referencedColumns: ['id']
                    },
                ]
            }
            games: {
                Row: {
                    card_language: Database['public']['Enums']['card_locale']
                    code: string
                    created_at: string
                    ended_at: string | null
                    exact_year: boolean
                    id: string
                    started_at: string | null
                    target_score: number
                    version: number
                }
                Insert: {
                    card_language: Database['public']['Enums']['card_locale']
                    code: string
                    created_at?: string
                    ended_at?: string | null
                    exact_year?: boolean
                    id?: string
                    started_at?: string | null
                    target_score?: number
                    version?: number
                }
                Update: {
                    card_language?: Database['public']['Enums']['card_locale']
                    code?: string
                    created_at?: string
                    ended_at?: string | null
                    exact_year?: boolean
                    id?: string
                    started_at?: string | null
                    target_score?: number
                    version?: number
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
            add_machine_translations: {
                Args: {
                    actor: string
                    card_id: string
                    english: string
                    translations: Json
                }
                Returns: Json
            }
            archive_card: {
                Args: { actor: string; card_id: string }
                Returns: undefined
            }
            audit_actors: {
                Args: never
                Returns: {
                    email: string
                    id: string
                }[]
            }
            audit_kinds: {
                Args: never
                Returns: {
                    action: string
                    entity: string
                }[]
            }
            bulk_card_action: {
                Args: {
                    action: string
                    actor: string
                    card_ids: string[]
                    category_id?: string
                }
                Returns: {
                    card_id: string
                    card_text: string
                    done: boolean
                    reason: string
                }[]
            }
            card_date_parts_valid: {
                Args: { day: number; decade: number; month: number; year: number }
                Returns: boolean
            }
            card_publish_blockers: { Args: { card_id: string }; Returns: string[] }
            cards_matching: {
                Args: { filter?: Json }
                Returns: {
                    archived_at: string | null
                    archived_by: string | null
                    archived_from: Database['public']['Enums']['card_status'] | null
                    category_id: string
                    created_at: string
                    created_by: string | null
                    day: number | null
                    decade: number | null
                    difficulty: number | null
                    id: string
                    month: number | null
                    source_quote: string | null
                    source_url: string | null
                    status: Database['public']['Enums']['card_status']
                    tags: string[]
                    updated_at: string
                    updated_by: string | null
                    verified_at: string | null
                    verified_by: string | null
                    year: number | null
                }[]
                SetofOptions: {
                    from: '*'
                    to: 'cards'
                    isOneToOne: false
                    isSetofReturn: true
                }
            }
            change_player: {
                Args: {
                    code: string
                    player: string
                    player_icon: string
                    player_name: string
                }
                Returns: {
                    changed_game: string
                    game_version: number
                }[]
            }
            create_game: {
                Args: {
                    card_language: Database['public']['Enums']['card_locale']
                    code: string
                    host: string
                    host_icon: string
                    host_name: string
                }
                Returns: string
            }
            current_actor: { Args: never; Returns: string }
            custom_access_token_hook: { Args: { event: Json }; Returns: Json }
            decade_of: { Args: { year: number }; Returns: number }
            delete_category: {
                Args: { actor: string; category_id: string }
                Returns: undefined
            }
            delete_draft: {
                Args: { actor: string; card_id: string }
                Returns: undefined
            }
            import_cards: {
                Args: { actor: string; cards: Json; file_name?: string }
                Returns: string[]
            }
            import_photo_cards: {
                Args: { actor: string; cards: Json; request_id?: number }
                Returns: string[]
            }
            invite_person: {
                Args: {
                    actor: string
                    email: string
                    role: Database['public']['Enums']['app_role']
                }
                Returns: string
            }
            is_google_user: { Args: { app_metadata: Json }; Returns: boolean }
            join_game: {
                Args: {
                    code: string
                    player: string
                    player_icon: string
                    player_name: string
                }
                Returns: {
                    game_version: number
                    joined_game: string
                }[]
            }
            leave_game: {
                Args: { code: string; player: string }
                Returns: {
                    game_version: number
                    left_game: string
                }[]
            }
            like_literal: { Args: { text: string }; Returns: string }
            list_people: {
                Args: never
                Returns: {
                    email: string
                    granted_at: string
                    role: Database['public']['Enums']['app_role']
                    user_id: string
                }[]
            }
            lock_card: {
                Args: { card_id: string }
                Returns: Database['public']['Enums']['card_status']
            }
            lock_category_positions: { Args: never; Returns: undefined }
            lock_lobby: {
                Args: { code: string }
                Returns: {
                    card_language: Database['public']['Enums']['card_locale']
                    code: string
                    created_at: string
                    ended_at: string | null
                    exact_year: boolean
                    id: string
                    started_at: string | null
                    target_score: number
                    version: number
                }
                SetofOptions: {
                    from: '*'
                    to: 'games'
                    isOneToOne: true
                    isSetofReturn: false
                }
            }
            move_card: {
                Args: { actor: string; card_id: string; category_id: string }
                Returns: undefined
            }
            publish_card: {
                Args: { actor: string; card_id: string }
                Returns: undefined
            }
            record_audit: {
                Args: {
                    action: string
                    actor: string
                    after?: Json
                    before?: Json
                    details?: Json
                    entity: string
                    entity_id: string
                    locale?: Database['public']['Enums']['card_locale']
                }
                Returns: number
            }
            remove_player: {
                Args: { code: string; host: string; seat: string }
                Returns: {
                    game_version: number
                    removed_game: string
                }[]
            }
            reorder_categories: {
                Args: { actor: string; ids: string[] }
                Returns: undefined
            }
            require_admin: {
                Args: { actor: string; reason?: string }
                Returns: undefined
            }
            require_publishable: { Args: { card_id: string }; Returns: undefined }
            save_card: {
                Args: {
                    actor: string
                    card: Json
                    card_id?: string
                    translations: Json
                }
                Returns: string
            }
            save_category: {
                Args: {
                    actor: string
                    category: Json
                    category_id?: string
                    names: Json
                }
                Returns: string
            }
            set_actor: { Args: { actor: string }; Returns: undefined }
            set_card_verified: {
                Args: { actor: string; card_id: string; verified: boolean }
                Returns: undefined
            }
            set_category_archived: {
                Args: { actor: string; archived: boolean; category_id: string }
                Returns: undefined
            }
            set_invite_role: {
                Args: {
                    actor: string
                    invite_email: string
                    new_role?: Database['public']['Enums']['app_role']
                }
                Returns: undefined
            }
            set_person_role: {
                Args: {
                    actor: string
                    new_role?: Database['public']['Enums']['app_role']
                    person_id: string
                }
                Returns: undefined
            }
            unarchive_card: {
                Args: { actor: string; card_id: string }
                Returns: undefined
            }
        }
        Enums: {
            app_role: 'admin' | 'editor'
            card_locale: 'en' | 'sv' | 'nb'
            card_status: 'draft' | 'published' | 'archived'
            translation_status: 'machine' | 'reviewed' | 'stale'
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
            card_locale: ['en', 'sv', 'nb'],
            card_status: ['draft', 'published', 'archived'],
            translation_status: ['machine', 'reviewed', 'stale'],
        },
    },
} as const
