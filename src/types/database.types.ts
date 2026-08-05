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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          base_currency: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          owner_id: string
          provider_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          account_type: Database["public"]["Enums"]["account_type"]
          base_currency: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          owner_id: string
          provider_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"]
          base_currency?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          owner_id?: string
          provider_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_owner_workspace_fk"
            columns: ["workspace_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "accounts_provider_workspace_fk"
            columns: ["workspace_id", "provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_classes: {
        Row: {
          code: string
          color_hex: string
          created_at: string
          created_by: string | null
          id: string
          include_in_allocation_chart: boolean
          include_in_xirr: boolean
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          code: string
          color_hex: string
          created_at?: string
          created_by?: string | null
          id?: string
          include_in_allocation_chart?: boolean
          include_in_xirr?: boolean
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          code?: string
          color_hex?: string
          created_at?: string
          created_by?: string | null
          id?: string
          include_in_allocation_chart?: boolean
          include_in_xirr?: boolean
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_classes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_channels: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_channels_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rates: {
        Row: {
          created_at: string
          created_by: string | null
          from_currency: string
          id: string
          notes: string | null
          rate: number
          rate_date: string
          source: Database["public"]["Enums"]["portfolio_data_source"]
          to_currency: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          from_currency: string
          id?: string
          notes?: string | null
          rate: number
          rate_date: string
          source?: Database["public"]["Enums"]["portfolio_data_source"]
          to_currency: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          from_currency?: string
          id?: string
          notes?: string | null
          rate?: number
          rate_date?: string
          source?: Database["public"]["Enums"]["portfolio_data_source"]
          to_currency?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_rates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      instrument_prices: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          id: string
          instrument_id: string
          notes: string | null
          price: number
          price_date: string
          source: Database["public"]["Enums"]["portfolio_data_source"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency: string
          id?: string
          instrument_id: string
          notes?: string | null
          price: number
          price_date: string
          source?: Database["public"]["Enums"]["portfolio_data_source"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          instrument_id?: string
          notes?: string | null
          price?: number
          price_date?: string
          source?: Database["public"]["Enums"]["portfolio_data_source"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instrument_prices_instrument_workspace_fk"
            columns: ["workspace_id", "instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      instruments: {
        Row: {
          asset_class_id: string
          created_at: string
          created_by: string | null
          default_currency: string
          exchange: string | null
          id: string
          instrument_kind: Database["public"]["Enums"]["instrument_kind"]
          is_active: boolean
          isin: string | null
          name: string
          ticker: string | null
          tracking_mode: Database["public"]["Enums"]["instrument_tracking_mode"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          asset_class_id: string
          created_at?: string
          created_by?: string | null
          default_currency: string
          exchange?: string | null
          id?: string
          instrument_kind?: Database["public"]["Enums"]["instrument_kind"]
          is_active?: boolean
          isin?: string | null
          name: string
          ticker?: string | null
          tracking_mode?: Database["public"]["Enums"]["instrument_tracking_mode"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          asset_class_id?: string
          created_at?: string
          created_by?: string | null
          default_currency?: string
          exchange?: string | null
          id?: string
          instrument_kind?: Database["public"]["Enums"]["instrument_kind"]
          is_active?: boolean
          isin?: string | null
          name?: string
          ticker?: string | null
          tracking_mode?: Database["public"]["Enums"]["instrument_tracking_mode"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instruments_asset_class_workspace_fk"
            columns: ["workspace_id", "asset_class_id"]
            isOneToOne: false
            referencedRelation: "asset_classes"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "instruments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      owners: {
        Row: {
          created_at: string
          created_by: string | null
          display_name: string
          id: string
          is_active: boolean
          sort_order: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          display_name: string
          id?: string
          is_active?: boolean
          sort_order?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          display_name?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "owners_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_operation_entries: {
        Row: {
          account_id: string
          base_cash_delta: number | null
          base_value_delta: number | null
          cash_delta: number
          component: Database["public"]["Enums"]["portfolio_operation_component"]
          created_at: string
          created_by: string | null
          currency: string
          fx_rate_to_base: number | null
          id: string
          instrument_id: string | null
          memo: string | null
          operation_id: string
          quantity_delta: number
          sequence_no: number
          unit_price: number | null
          updated_at: string
          value_delta: number
          workspace_id: string
        }
        Insert: {
          account_id: string
          base_cash_delta?: number | null
          base_value_delta?: number | null
          cash_delta?: number
          component?: Database["public"]["Enums"]["portfolio_operation_component"]
          created_at?: string
          created_by?: string | null
          currency: string
          fx_rate_to_base?: number | null
          id?: string
          instrument_id?: string | null
          memo?: string | null
          operation_id: string
          quantity_delta?: number
          sequence_no?: number
          unit_price?: number | null
          updated_at?: string
          value_delta?: number
          workspace_id: string
        }
        Update: {
          account_id?: string
          base_cash_delta?: number | null
          base_value_delta?: number | null
          cash_delta?: number
          component?: Database["public"]["Enums"]["portfolio_operation_component"]
          created_at?: string
          created_by?: string | null
          currency?: string
          fx_rate_to_base?: number | null
          id?: string
          instrument_id?: string | null
          memo?: string | null
          operation_id?: string
          quantity_delta?: number
          sequence_no?: number
          unit_price?: number | null
          updated_at?: string
          value_delta?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_operation_entries_account_workspace_fk"
            columns: ["workspace_id", "account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "portfolio_operation_entries_instrument_workspace_fk"
            columns: ["workspace_id", "instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "portfolio_operation_entries_operation_workspace_fk"
            columns: ["workspace_id", "operation_id"]
            isOneToOne: false
            referencedRelation: "portfolio_operation_legs"
            referencedColumns: ["workspace_id", "operation_id"]
          },
          {
            foreignKeyName: "portfolio_operation_entries_operation_workspace_fk"
            columns: ["workspace_id", "operation_id"]
            isOneToOne: false
            referencedRelation: "portfolio_operations"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      portfolio_operations: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          executed_at: string | null
          external_reference: string | null
          id: string
          notes: string | null
          operation_date: string
          operation_type: Database["public"]["Enums"]["portfolio_operation_type"]
          source: Database["public"]["Enums"]["portfolio_data_source"]
          status: Database["public"]["Enums"]["portfolio_operation_status"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          executed_at?: string | null
          external_reference?: string | null
          id?: string
          notes?: string | null
          operation_date: string
          operation_type: Database["public"]["Enums"]["portfolio_operation_type"]
          source?: Database["public"]["Enums"]["portfolio_data_source"]
          status?: Database["public"]["Enums"]["portfolio_operation_status"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          executed_at?: string | null
          external_reference?: string | null
          id?: string
          notes?: string | null
          operation_date?: string
          operation_type?: Database["public"]["Enums"]["portfolio_operation_type"]
          source?: Database["public"]["Enums"]["portfolio_data_source"]
          status?: Database["public"]["Enums"]["portfolio_operation_status"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_operations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      position_snapshots: {
        Row: {
          account_id: string
          created_at: string
          created_by: string | null
          currency: string
          fx_rate_to_base: number | null
          id: string
          instrument_id: string
          market_value: number
          market_value_base: number | null
          notes: string | null
          quantity: number | null
          snapshot_date: string
          source: Database["public"]["Enums"]["portfolio_data_source"]
          unit_price: number | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          created_by?: string | null
          currency: string
          fx_rate_to_base?: number | null
          id?: string
          instrument_id: string
          market_value: number
          market_value_base?: number | null
          notes?: string | null
          quantity?: number | null
          snapshot_date: string
          source?: Database["public"]["Enums"]["portfolio_data_source"]
          unit_price?: number | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          fx_rate_to_base?: number | null
          id?: string
          instrument_id?: string
          market_value?: number
          market_value_base?: number | null
          notes?: string | null
          quantity?: number | null
          snapshot_date?: string
          source?: Database["public"]["Enums"]["portfolio_data_source"]
          unit_price?: number | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "position_snapshots_account_workspace_fk"
            columns: ["workspace_id", "account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "position_snapshots_instrument_workspace_fk"
            columns: ["workspace_id", "instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      providers: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          provider_type: Database["public"]["Enums"]["provider_type"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          provider_type: Database["public"]["Enums"]["provider_type"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          provider_type?: Database["public"]["Enums"]["provider_type"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "providers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          created_by: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          base_currency: string
          created_at: string
          created_by: string | null
          detailed_tracking_start_date: string | null
          id: string
          name: string
          timezone: string
          updated_at: string
        }
        Insert: {
          base_currency?: string
          created_at?: string
          created_by?: string | null
          detailed_tracking_start_date?: string | null
          id?: string
          name: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          base_currency?: string
          created_at?: string
          created_by?: string | null
          detailed_tracking_start_date?: string | null
          id?: string
          name?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      portfolio_operation_legs: {
        Row: {
          account_base_currency: string | null
          account_id: string | null
          account_name: string | null
          base_cash_delta: number | null
          base_value_delta: number | null
          cash_delta: number | null
          component:
            | Database["public"]["Enums"]["portfolio_operation_component"]
            | null
          currency: string | null
          description: string | null
          entry_id: string | null
          executed_at: string | null
          executed_at_local: string | null
          fx_rate_to_base: number | null
          instrument_id: string | null
          instrument_name: string | null
          instrument_ticker: string | null
          notes: string | null
          operation_created_at: string | null
          operation_date: string | null
          operation_id: string | null
          operation_time_local: string | null
          operation_type:
            | Database["public"]["Enums"]["portfolio_operation_type"]
            | null
          owner_id: string | null
          owner_name: string | null
          provider_id: string | null
          provider_name: string | null
          quantity_delta: number | null
          sequence_no: number | null
          source: Database["public"]["Enums"]["portfolio_data_source"] | null
          status:
            | Database["public"]["Enums"]["portfolio_operation_status"]
            | null
          unit_price: number | null
          value_delta: number | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_operations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      create_cash_operation: {
        Args: {
          p_account_id: string
          p_amount: number
          p_currency: string
          p_description?: string
          p_notes?: string
          p_operation_date: string
          p_operation_time?: string
          p_operation_type: Database["public"]["Enums"]["portfolio_operation_type"]
        }
        Returns: string
      }
      create_currency_exchange: {
        Args: {
          p_base_value?: number
          p_description?: string
          p_from_account_id: string
          p_from_amount: number
          p_from_currency: string
          p_notes?: string
          p_operation_date: string
          p_operation_time?: string
          p_to_account_id: string
          p_to_amount: number
          p_to_currency: string
        }
        Returns: string
      }
      create_internal_transfer: {
        Args: {
          p_amount: number
          p_currency: string
          p_description?: string
          p_from_account_id: string
          p_notes?: string
          p_operation_date: string
          p_operation_time?: string
          p_to_account_id: string
        }
        Returns: string
      }
      create_trade_operation: {
        Args: {
          p_account_id: string
          p_actual_cash_amount: number
          p_base_value?: number
          p_cash_currency: string
          p_description?: string
          p_fee_amount?: number
          p_instrument_id: string
          p_notes?: string
          p_operation_date: string
          p_operation_time?: string
          p_operation_type: Database["public"]["Enums"]["portfolio_operation_type"]
          p_quantity: number
          p_tax_amount?: number
        }
        Returns: string
      }
      create_workspace: {
        Args: {
          p_base_currency?: string
          p_detailed_tracking_start_date?: string
          p_name: string
          p_timezone?: string
        }
        Returns: string
      }
    }
    Enums: {
      account_type:
        | "brokerage_pln"
        | "brokerage_foreign"
        | "ike"
        | "ikze"
        | "oki"
        | "ppk"
        | "bonds"
        | "crypto"
        | "other"
      instrument_kind:
        | "stock"
        | "etf"
        | "reit"
        | "crypto"
        | "government_bond"
        | "ppk_fund"
        | "other"
      instrument_tracking_mode: "units" | "balance"
      portfolio_data_source:
        | "manual"
        | "import"
        | "market_data"
        | "broker_sync"
        | "system"
      portfolio_operation_component:
        | "principal"
        | "fee"
        | "tax"
        | "income"
        | "transfer"
        | "adjustment"
      portfolio_operation_status: "draft" | "posted" | "voided"
      portfolio_operation_type:
        | "opening_position"
        | "deposit"
        | "withdrawal"
        | "internal_transfer"
        | "currency_exchange"
        | "buy"
        | "sell"
        | "dividend"
        | "interest"
        | "fee"
        | "tax"
        | "balance_adjustment"
        | "quantity_adjustment"
        | "other"
      provider_type:
        | "brokerage"
        | "bank"
        | "fund_manager"
        | "crypto_platform"
        | "other"
      workspace_role: "admin" | "editor" | "viewer"
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
    Enums: {
      account_type: [
        "brokerage_pln",
        "brokerage_foreign",
        "ike",
        "ikze",
        "oki",
        "ppk",
        "bonds",
        "crypto",
        "other",
      ],
      instrument_kind: [
        "stock",
        "etf",
        "reit",
        "crypto",
        "government_bond",
        "ppk_fund",
        "other",
      ],
      instrument_tracking_mode: ["units", "balance"],
      portfolio_data_source: [
        "manual",
        "import",
        "market_data",
        "broker_sync",
        "system",
      ],
      portfolio_operation_component: [
        "principal",
        "fee",
        "tax",
        "income",
        "transfer",
        "adjustment",
      ],
      portfolio_operation_status: ["draft", "posted", "voided"],
      portfolio_operation_type: [
        "opening_position",
        "deposit",
        "withdrawal",
        "internal_transfer",
        "currency_exchange",
        "buy",
        "sell",
        "dividend",
        "interest",
        "fee",
        "tax",
        "balance_adjustment",
        "quantity_adjustment",
        "other",
      ],
      provider_type: [
        "brokerage",
        "bank",
        "fund_manager",
        "crypto_platform",
        "other",
      ],
      workspace_role: ["admin", "editor", "viewer"],
    },
  },
} as const
