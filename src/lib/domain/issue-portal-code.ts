import { allocateNextPortalCode } from "@/lib/domain/portal";
import { FRS_ISSUE_PORTAL_CODES } from "@/lib/product-surface";

/** Allocate FLR{ddMMyy}{NNN} using today's IST date and the next daily sequence. */
export async function issuePortalCode(supabase: {
  from: (table: string) => {
    select: (cols: string) => {
      like: (
        col: string,
        pattern: string
      ) => PromiseLike<{
        data: Array<{ portal_code: string | null }> | null;
        error: { message: string } | null;
      }>;
    };
  };
}): Promise<string> {
  if (!FRS_ISSUE_PORTAL_CODES) {
    throw new Error("FRS_PORTAL_DISABLED");
  }
  return allocateNextPortalCode(async (prefix) => {
    const { data, error } = await supabase
      .from("leads")
      .select("portal_code")
      .like("portal_code", `${prefix}%`);
    if (error) throw new Error(error.message);
    return (data ?? [])
      .map((row) => row.portal_code)
      .filter((code): code is string => Boolean(code));
  });
}
