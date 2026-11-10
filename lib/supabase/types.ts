// Hand-authored to mirror supabase/migrations/0001_init.sql. Once a live DB
// is available (local Docker or a hosted project), regenerate with:
//   supabase gen types typescript --local > lib/supabase/types.ts
// and this file becomes generated rather than hand-maintained.

export type StaffRole = "admin" | "cashier";
export type TabStatus = "open" | "pending_payment" | "closed" | "merged" | "voided";
export type OrderStatus = "open" | "void";
export type LineStatus = "active" | "voided";
export type PaymentMethod = "cash" | "mpesa";
export type PaymentStatus = "pending" | "completed" | "failed";
export type StockMovementReason = "sale" | "restock" | "adjustment" | "void_return";

export interface Database {
  public: {
    Tables: {
      staff: {
        Row: {
          id: string;
          auth_user_id: string;
          name: string;
          phone: string | null;
          pin_hash: string;
          role: StaffRole;
          is_active: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["staff"]["Row"]> & {
          auth_user_id: string;
          name: string;
          pin_hash: string;
          role: StaffRole;
        };
        Update: Partial<Database["public"]["Tables"]["staff"]["Row"]>;
        Relationships: [];
      };
      categories: {
        Row: { id: string; name: string; sort_order: number };
        Insert: Partial<Database["public"]["Tables"]["categories"]["Row"]> & { name: string };
        Update: Partial<Database["public"]["Tables"]["categories"]["Row"]>;
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          category_id: string | null;
          name: string;
          price: number;
          sku: string | null;
          stock_qty: number;
          track_stock: boolean;
          low_stock_threshold: number;
          is_active: boolean;
          image_url: string | null;
          size: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["products"]["Row"]> & { name: string; price: number };
        Update: Partial<Database["public"]["Tables"]["products"]["Row"]>;
        Relationships: [];
      };
      tables: {
        Row: { id: string; label: string; is_active: boolean };
        Insert: Partial<Database["public"]["Tables"]["tables"]["Row"]> & { label: string };
        Update: Partial<Database["public"]["Tables"]["tables"]["Row"]>;
        Relationships: [];
      };
      tabs: {
        Row: {
          id: string;
          table_id: string | null;
          label: string | null;
          customer_phone: string | null;
          status: TabStatus;
          merged_into_tab_id: string | null;
          opened_by: string;
          opened_at: string;
          closed_by: string | null;
          closed_at: string | null;
          version: number;
        };
        Insert: Partial<Database["public"]["Tables"]["tabs"]["Row"]> & {
          id: string;
          status: TabStatus;
          opened_by: string;
        };
        Update: Partial<Database["public"]["Tables"]["tabs"]["Row"]>;
        Relationships: [];
      };
      orders: {
        Row: { id: string; tab_id: string; created_by: string; status: OrderStatus; created_at: string };
        Insert: Partial<Database["public"]["Tables"]["orders"]["Row"]> & {
          id: string;
          tab_id: string;
          created_by: string;
          status: OrderStatus;
        };
        Update: Partial<Database["public"]["Tables"]["orders"]["Row"]>;
        Relationships: [];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string;
          quantity: number;
          unit_price: number;
          line_status: LineStatus;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["order_items"]["Row"]> & {
          id: string;
          order_id: string;
          product_id: string;
          quantity: number;
          unit_price: number;
          line_status: LineStatus;
        };
        Update: Partial<Database["public"]["Tables"]["order_items"]["Row"]>;
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          tab_id: string;
          method: PaymentMethod;
          amount: number;
          status: PaymentStatus;
          mpesa_checkout_request_id: string | null;
          mpesa_receipt_number: string | null;
          recorded_by: string | null;
          created_at: string;
          completed_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["payments"]["Row"]> & {
          id: string;
          tab_id: string;
          method: PaymentMethod;
          amount: number;
          status: PaymentStatus;
        };
        Update: Partial<Database["public"]["Tables"]["payments"]["Row"]>;
        Relationships: [];
      };
      stock_movements: {
        Row: {
          id: string;
          product_id: string;
          change_qty: number;
          reason: StockMovementReason;
          order_item_id: string | null;
          staff_id: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["stock_movements"]["Row"]> & {
          id: string;
          product_id: string;
          change_qty: number;
          reason: StockMovementReason;
          staff_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["stock_movements"]["Row"]>;
        Relationships: [];
      };
    };
    Views: {
      tab_totals: {
        Row: { tab_id: string; items_total: number; paid_total: number; balance: number };
        Relationships: [];
      };
    };
    Functions: {
      update_tab_status: {
        Args: {
          p_tab_id: string;
          p_expected_version: number;
          p_new_status: TabStatus;
          p_closed_by?: string | null;
        };
        Returns: Database["public"]["Tables"]["tabs"]["Row"];
      };
    };
  };
}
