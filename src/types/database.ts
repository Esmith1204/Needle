// Mirrors supabase/migrations/*.sql. To regenerate from the live project instead:
//   npx supabase gen types typescript --project-id <id> > src/types/database.ts

export type RatingMethod = "manual" | "comparison";

/** A like or a repost: one person's mark on one rating. */
type EngagementTable<Name extends string> = {
  Row: {
    user_id: string;
    rating_id: string;
    created_at: string;
  };
  Insert: {
    user_id: string;
    rating_id: string;
    created_at?: string;
  };
  Update: never;
  Relationships: [
    {
      foreignKeyName: `${Name}_user_id_fkey`;
      columns: ["user_id"];
      isOneToOne: false;
      referencedRelation: "profiles";
      referencedColumns: ["id"];
    },
    {
      foreignKeyName: `${Name}_rating_id_fkey`;
      columns: ["rating_id"];
      isOneToOne: false;
      referencedRelation: "ratings";
      referencedColumns: ["id"];
    },
  ];
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          handle: string;
          display_name: string;
          avatar_url: string | null;
          banner_url: string | null;
          bio: string;
          created_at: string;
        };
        Insert: {
          id: string;
          handle: string;
          display_name: string;
          avatar_url?: string | null;
          banner_url?: string | null;
          bio?: string;
          created_at?: string;
        };
        Update: {
          handle?: string;
          display_name?: string;
          avatar_url?: string | null;
          banner_url?: string | null;
          bio?: string;
        };
        Relationships: [];
      };
      ratings: {
        Row: {
          id: string;
          user_id: string;
          album_title: string;
          album_artist: string | null;
          album_year: number | null;
          cover_url: string;
          rating: number;
          review: string;
          method: RatingMethod;
          deezer_album_id: string | null;
          itunes_album_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          album_title: string;
          album_artist?: string | null;
          album_year?: number | null;
          cover_url: string;
          rating: number;
          review?: string;
          method?: RatingMethod;
          deezer_album_id?: string | null;
          itunes_album_id?: string | null;
          created_at?: string;
        };
        Update: {
          rating?: number;
          review?: string;
          method?: RatingMethod;
        };
        Relationships: [
          {
            foreignKeyName: "ratings_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      follows: {
        Row: {
          follower_id: string;
          following_id: string;
          created_at: string;
        };
        Insert: {
          follower_id: string;
          following_id: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: "follows_follower_id_fkey";
            columns: ["follower_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "follows_following_id_fkey";
            columns: ["following_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      likes: EngagementTable<"likes">;
      reposts: EngagementTable<"reposts">;
      comments: {
        Row: {
          id: string;
          rating_id: string;
          user_id: string;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          rating_id: string;
          user_id: string;
          body: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: "comments_rating_id_fkey";
            columns: ["rating_id"];
            isOneToOne: false;
            referencedRelation: "ratings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      album_lists: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          description?: string;
          created_at?: string;
        };
        Update: {
          title?: string;
          description?: string;
        };
        Relationships: [
          {
            foreignKeyName: "album_lists_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      album_list_items: {
        Row: {
          id: string;
          list_id: string;
          sort_order: number;
          album_title: string;
          album_artist: string | null;
          album_year: number | null;
          cover_url: string;
        };
        Insert: {
          id?: string;
          list_id: string;
          sort_order: number;
          album_title: string;
          album_artist?: string | null;
          album_year?: number | null;
          cover_url: string;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: "album_list_items_list_id_fkey";
            columns: ["list_id"];
            isOneToOne: false;
            referencedRelation: "album_lists";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      handle_available: {
        Args: { candidate: string };
        Returns: boolean;
      };
      profile_stats: {
        Args: { target: string };
        Returns: { rating_count: number; follower_count: number; following_count: number } | null;
      };
      save_album_list: {
        Args: {
          list_id: string | null;
          list_title: string;
          list_description: string;
          albums: { title: string; artist: string | null; year: number | null; coverUrl: string }[];
        };
        Returns: string;
      };
      delete_my_account: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      authorize_account_change: {
        Args: { change: string };
        Returns: undefined;
      };
      account_security_status: {
        Args: Record<string, never>;
        Returns: { has_password: boolean; has_recovery_code: boolean };
      };
      ensure_email_identity: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      create_recovery_code: {
        Args: Record<string, never>;
        Returns: string;
      };
      redeem_recovery_code: {
        Args: { code: string };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
