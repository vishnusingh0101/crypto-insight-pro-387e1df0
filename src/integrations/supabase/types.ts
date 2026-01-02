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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      market_snapshots: {
        Row: {
          ath: number | null
          ath_date: string | null
          circulating_supply: number | null
          coin_id: string
          coin_name: string
          coin_symbol: string
          collected_at: string
          current_price: number
          high_24h: number | null
          id: string
          low_24h: number | null
          market_cap: number | null
          market_cap_rank: number | null
          price_change_1h: number | null
          price_change_24h: number | null
          price_change_30d: number | null
          price_change_7d: number | null
          raw_data: Json | null
          total_supply: number | null
          volume_24h: number | null
        }
        Insert: {
          ath?: number | null
          ath_date?: string | null
          circulating_supply?: number | null
          coin_id: string
          coin_name: string
          coin_symbol: string
          collected_at?: string
          current_price: number
          high_24h?: number | null
          id?: string
          low_24h?: number | null
          market_cap?: number | null
          market_cap_rank?: number | null
          price_change_1h?: number | null
          price_change_24h?: number | null
          price_change_30d?: number | null
          price_change_7d?: number | null
          raw_data?: Json | null
          total_supply?: number | null
          volume_24h?: number | null
        }
        Update: {
          ath?: number | null
          ath_date?: string | null
          circulating_supply?: number | null
          coin_id?: string
          coin_name?: string
          coin_symbol?: string
          collected_at?: string
          current_price?: number
          high_24h?: number | null
          id?: string
          low_24h?: number | null
          market_cap?: number | null
          market_cap_rank?: number | null
          price_change_1h?: number | null
          price_change_24h?: number | null
          price_change_30d?: number | null
          price_change_7d?: number | null
          raw_data?: Json | null
          total_supply?: number | null
          volume_24h?: number | null
        }
        Relationships: []
      }
      strategy_improvements: {
        Row: {
          ai_analysis: string
          analyzed_at: string
          applied: boolean | null
          created_at: string
          failed_predictions: number
          id: string
          recommended_changes: Json | null
          success_rate: number | null
          successful_predictions: number
          total_predictions_analyzed: number
        }
        Insert: {
          ai_analysis: string
          analyzed_at?: string
          applied?: boolean | null
          created_at?: string
          failed_predictions: number
          id?: string
          recommended_changes?: Json | null
          success_rate?: number | null
          successful_predictions: number
          total_predictions_analyzed: number
        }
        Update: {
          ai_analysis?: string
          analyzed_at?: string
          applied?: boolean | null
          created_at?: string
          failed_predictions?: number
          id?: string
          recommended_changes?: Json | null
          success_rate?: number | null
          successful_predictions?: number
          total_predictions_analyzed?: number
        }
        Relationships: []
      }
      system_performance: {
        Row: {
          accuracy_percent: number | null
          capital_protection_enabled: boolean
          capital_protection_reason: string | null
          consecutive_losses: number
          failed_trades: number
          id: string
          last_updated_at: string
          mode: string
          successful_trades: number
          total_trades: number
        }
        Insert: {
          accuracy_percent?: number | null
          capital_protection_enabled?: boolean
          capital_protection_reason?: string | null
          consecutive_losses?: number
          failed_trades?: number
          id?: string
          last_updated_at?: string
          mode?: string
          successful_trades?: number
          total_trades?: number
        }
        Update: {
          accuracy_percent?: number | null
          capital_protection_enabled?: boolean
          capital_protection_reason?: string | null
          consecutive_losses?: number
          failed_trades?: number
          id?: string
          last_updated_at?: string
          mode?: string
          successful_trades?: number
          total_trades?: number
        }
        Relationships: []
      }
      trade_history: {
        Row: {
          action: string
          capital_protection_active: boolean | null
          closed_at: string | null
          coin_id: string
          coin_name: string
          coin_symbol: string
          confidence_score: number | null
          created_at: string
          entry_price: number
          exit_price: number | null
          id: string
          profit_loss_percent: number | null
          reasoning: string | null
          result: string | null
          stop_loss: number
          target_price: number
          whale_intent: string | null
        }
        Insert: {
          action: string
          capital_protection_active?: boolean | null
          closed_at?: string | null
          coin_id: string
          coin_name: string
          coin_symbol: string
          confidence_score?: number | null
          created_at?: string
          entry_price: number
          exit_price?: number | null
          id?: string
          profit_loss_percent?: number | null
          reasoning?: string | null
          result?: string | null
          stop_loss: number
          target_price: number
          whale_intent?: string | null
        }
        Update: {
          action?: string
          capital_protection_active?: boolean | null
          closed_at?: string | null
          coin_id?: string
          coin_name?: string
          coin_symbol?: string
          confidence_score?: number | null
          created_at?: string
          entry_price?: number
          exit_price?: number | null
          id?: string
          profit_loss_percent?: number | null
          reasoning?: string | null
          result?: string | null
          stop_loss?: number
          target_price?: number
          whale_intent?: string | null
        }
        Relationships: []
      }
      trade_predictions: {
        Row: {
          action: string
          actual_price_after_24h: number | null
          atr_at_prediction: number | null
          buy_score: number | null
          coin_id: string
          coin_name: string
          created_at: string
          entry_price: number
          id: string
          market_cap_rank: number | null
          outcome_checked_at: string | null
          predicted_at: string
          profit_loss_percent: number | null
          rsi_at_prediction: number | null
          sell_score: number | null
          stop_loss: number
          success_probability: number
          target_price: number
          volume_ratio_at_prediction: number | null
          was_successful: boolean | null
        }
        Insert: {
          action: string
          actual_price_after_24h?: number | null
          atr_at_prediction?: number | null
          buy_score?: number | null
          coin_id: string
          coin_name: string
          created_at?: string
          entry_price: number
          id?: string
          market_cap_rank?: number | null
          outcome_checked_at?: string | null
          predicted_at?: string
          profit_loss_percent?: number | null
          rsi_at_prediction?: number | null
          sell_score?: number | null
          stop_loss: number
          success_probability: number
          target_price: number
          volume_ratio_at_prediction?: number | null
          was_successful?: boolean | null
        }
        Update: {
          action?: string
          actual_price_after_24h?: number | null
          atr_at_prediction?: number | null
          buy_score?: number | null
          coin_id?: string
          coin_name?: string
          created_at?: string
          entry_price?: number
          id?: string
          market_cap_rank?: number | null
          outcome_checked_at?: string | null
          predicted_at?: string
          profit_loss_percent?: number | null
          rsi_at_prediction?: number | null
          sell_score?: number | null
          stop_loss?: number
          success_probability?: number
          target_price?: number
          volume_ratio_at_prediction?: number | null
          was_successful?: boolean | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
