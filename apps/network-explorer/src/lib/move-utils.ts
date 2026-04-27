/**
 * Move type formatting utilities for Package module explorer
 */

// Type for Move function parameter
export interface MoveParam {
  MutableReference?: { Struct?: { address: string; module: string; name: string } };
  Reference?: { Struct?: { address: string; module: string; name: string } };
  Struct?: { address: string; module: string; name: string };
  TypeParameter?: number;
  Vector?: unknown;
  U8?: boolean;
  U64?: boolean;
  U128?: boolean;
  Bool?: boolean;
  Address?: boolean;
}

// Nasun branding: rewrite native Sui module/struct references for display
function brandStruct(s: { module: string; name: string }): { module: string; name: string } {
  let module = s.module;
  let name = s.name;
  if (module === 'sui') module = 'nasun';
  if (name === 'SUI') name = 'NSN';
  if (name === 'StakedSui') name = 'StakedNasun';
  if (name === 'SuiSystemState') name = 'NasunSystemState';
  return { module, name };
}

// Format Move type parameter for display
export function formatMoveType(param: MoveParam | string): string {
  if (typeof param === 'string') return param;

  if (param.MutableReference) {
    const inner = param.MutableReference.Struct;
    if (inner) {
      const b = brandStruct(inner);
      return `&mut ${b.module}::${b.name}`;
    }
    return '&mut ???';
  }
  if (param.Reference) {
    const inner = param.Reference.Struct;
    if (inner) {
      const b = brandStruct(inner);
      return `&${b.module}::${b.name}`;
    }
    return '&???';
  }
  if (param.Struct) {
    const b = brandStruct(param.Struct);
    return `${b.module}::${b.name}`;
  }
  if (param.TypeParameter !== undefined) return `T${param.TypeParameter}`;
  if (param.Vector) return `vector<...>`;
  if (param.U8) return 'u8';
  if (param.U64) return 'u64';
  if (param.U128) return 'u128';
  if (param.Bool) return 'bool';
  if (param.Address) return 'address';

  return JSON.stringify(param);
}
