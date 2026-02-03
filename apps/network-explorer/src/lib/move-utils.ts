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

// Format Move type parameter for display
export function formatMoveType(param: MoveParam | string): string {
  if (typeof param === 'string') return param;

  if (param.MutableReference) {
    const inner = param.MutableReference.Struct;
    if (inner) return `&mut ${inner.module}::${inner.name}`;
    return '&mut ???';
  }
  if (param.Reference) {
    const inner = param.Reference.Struct;
    if (inner) return `&${inner.module}::${inner.name}`;
    return '&???';
  }
  if (param.Struct) {
    return `${param.Struct.module}::${param.Struct.name}`;
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
