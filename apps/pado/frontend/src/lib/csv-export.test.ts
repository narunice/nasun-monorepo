import { describe, it, expect, vi } from 'vitest';
import { generateCsv, downloadCsv } from './csv-export';

interface TestRow {
  name: string;
  value: number;
  note: string;
}

const COLUMNS = [
  { header: 'Name', accessor: (r: TestRow) => r.name },
  { header: 'Value', accessor: (r: TestRow) => r.value },
  { header: 'Note', accessor: (r: TestRow) => r.note },
];

describe('csv-export', () => {
  describe('generateCsv', () => {
    it('generates correct CSV with header and rows', () => {
      const data: TestRow[] = [
        { name: 'Alice', value: 100, note: 'ok' },
        { name: 'Bob', value: 200, note: 'good' },
      ];
      const csv = generateCsv(data, COLUMNS);
      expect(csv).toBe('Name,Value,Note\nAlice,100,ok\nBob,200,good');
    });

    it('returns header only for empty data', () => {
      const csv = generateCsv([], COLUMNS);
      expect(csv).toBe('Name,Value,Note');
    });

    it('escapes strings containing commas', () => {
      const data: TestRow[] = [{ name: 'NBTC,NUSDC', value: 10, note: 'test' }];
      const csv = generateCsv(data, COLUMNS);
      expect(csv).toContain('"NBTC,NUSDC"');
    });

    it('escapes strings containing double quotes', () => {
      const data: TestRow[] = [{ name: 'say "hello"', value: 10, note: 'test' }];
      const csv = generateCsv(data, COLUMNS);
      expect(csv).toContain('"say ""hello"""');
    });

    it('escapes strings containing newlines', () => {
      const data: TestRow[] = [{ name: 'line1\nline2', value: 10, note: 'test' }];
      const csv = generateCsv(data, COLUMNS);
      expect(csv).toContain('"line1\nline2"');
    });

    it('converts number values to strings', () => {
      const data: TestRow[] = [{ name: 'x', value: 42.5, note: 'n' }];
      const csv = generateCsv(data, COLUMNS);
      expect(csv).toContain('42.5');
    });

    // CSV formula injection guard tests
    describe('formula injection guard', () => {
      it('prefixes strings starting with = to prevent formula injection', () => {
        const data: TestRow[] = [{ name: '=SUM(A1)', value: 0, note: 'ok' }];
        const csv = generateCsv(data, COLUMNS);
        const lines = csv.split('\n');
        // Should be prefixed with single quote
        expect(lines[1]).toContain("'=SUM(A1)");
      });

      it('prefixes strings starting with + to prevent formula injection', () => {
        const data: TestRow[] = [{ name: '+cmd|stuff', value: 0, note: 'ok' }];
        const csv = generateCsv(data, COLUMNS);
        const lines = csv.split('\n');
        expect(lines[1]).toContain("'+cmd|stuff");
      });

      it('prefixes strings starting with - to prevent formula injection', () => {
        const data: TestRow[] = [{ name: '-cmd|stuff', value: 0, note: 'ok' }];
        const csv = generateCsv(data, COLUMNS);
        const lines = csv.split('\n');
        expect(lines[1]).toContain("'-cmd|stuff");
      });

      it('prefixes strings starting with @ to prevent formula injection', () => {
        const data: TestRow[] = [{ name: '@SUM(A1)', value: 0, note: 'ok' }];
        const csv = generateCsv(data, COLUMNS);
        const lines = csv.split('\n');
        expect(lines[1]).toContain("'@SUM(A1)");
      });

      it('prefixes strings starting with tab to prevent formula injection', () => {
        const data: TestRow[] = [{ name: '\tcmd', value: 0, note: 'ok' }];
        const csv = generateCsv(data, COLUMNS);
        const lines = csv.split('\n');
        // Tab triggers formula guard: prefixed with single quote
        expect(lines[1].startsWith("'\tcmd")).toBe(true);
      });

      it('does not prefix normal strings', () => {
        const data: TestRow[] = [{ name: 'NBTC/NUSDC', value: 0, note: 'ok' }];
        const csv = generateCsv(data, COLUMNS);
        const lines = csv.split('\n');
        expect(lines[1]).toContain('NBTC/NUSDC');
        expect(lines[1]).not.toContain("'");
      });

      it('handles formula injection with comma (double escape)', () => {
        const data: TestRow[] = [{ name: '=1+1,evil', value: 0, note: 'ok' }];
        const csv = generateCsv(data, COLUMNS);
        // Should be prefixed AND quoted
        expect(csv).toContain("\"'=1+1,evil\"");
      });
    });
  });

  describe('downloadCsv', () => {
    it('creates and clicks a download link', () => {
      const createObjectURL = vi.fn().mockReturnValue('blob:test');
      const revokeObjectURL = vi.fn();
      Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, writable: true });
      Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, writable: true });

      const clickSpy = vi.fn();
      const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
        (node as HTMLAnchorElement).click = clickSpy;
        return node;
      });
      const removeSpy = vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);

      downloadCsv('col1,col2\na,b', 'test.csv');

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');

      appendSpy.mockRestore();
      removeSpy.mockRestore();
    });
  });
});
