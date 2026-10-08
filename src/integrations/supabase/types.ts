export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      eta_shares: {
        Row: {
          eta: string | null
          expires_at: string
          id: string
          remaining_m: number
          remaining_s: number
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          eta?: string | null
          expires_at?: string
          id?: string
          remaining_m?: number
          remaining_s?: number
          token?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          eta?: string | null
          expires_at?: string
          id?: string
          remaining_m?: number
          remaining_s?: number
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      report_votes: {
        Row: {
          kind: string
          report_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          kind: string
          report_id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          kind?: string
          report_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_votes_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "road_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      road_reports: {
        Row: {
          category: string
          created_at: string
          description: string
          expires_at: string
          hidden: boolean
          id: string
          lat: number
          lon: number
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string
          expires_at?: string
          hidden?: boolean
          id?: string
          lat: number
          lon: number
          user_id?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          expires_at?: string
          hidden?: boolean
          id?: string
          lat?: number
          lon?: number
          user_id?: string
        }
        Relationships: []
      }
      travel_preferences: {
        Row: {
          consent_at: string
          history_opt_in: boolean
          sync_opt_in: boolean
          user_id: string
        }
        Insert: {
          consent_at?: string
          history_opt_in?: boolean
          sync_opt_in?: boolean
          user_id?: string
        }
        Update: {
          consent_at?: string
          history_opt_in?: boolean
          sync_opt_in?: boolean
          user_id?: string
        }
        Relationships: []
      }
      trip_summaries: {
        Row: {
          completed: boolean
          distance_m: number
          duration_s: number
          ended_at: string
          expires_at: string
          id: string
          started_at: string
          user_id: string
        }
        Insert: {
          completed?: boolean
          distance_m?: number
          duration_s?: number
          ended_at: string
          expires_at?: string
          id: string
          started_at: string
          user_id?: string
        }
        Update: {
          completed?: boolean
          distance_m?: number
          duration_s?: number
          ended_at?: string
          expires_at?: string
          id?: string
          started_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_own_travel_data: { Args: never; Returns: undefined }
      nearby_road_reports: {
        Args: { east: number; north: number; south: number; west: number }
        Returns: {
          category: string
          confirmations: number
          created_at: string
          description: string
          expires_at: string
          id: string
          lat: number
          lon: number
        }[]
      }
      read_shared_eta: {
        Args: { share_token: string }
        Returns: {
          eta: string
          expires_at: string
          remaining_m: number
          remaining_s: number
          updated_at: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
