import { CharFlags, CharTypes } from './charClassifier';
import { Token } from '../token';
import { Chars } from '../chars';
import { ParserState } from '../parser/common';
import { fromCodePoint, readNext } from './common';
import { report, Errors } from '../errors';
import { scanEscapeSequence, Escape, handleStringError } from './string';
import { Context } from '../parser/bits';

export function scanTemplate(parser: ParserState, context: Context, source: string): Token {
  const { index: start } = parser;
  let ret: string | null = '';
  let token: Token = Token.TemplateTail;
  let char = readNext(parser);

  while (char !== Chars.Backtick) {
    if (char === Chars.Dollar) {
      if (source.charCodeAt(parser.index + 1) === Chars.LeftBrace) {
        parser.index++;
        token = Token.TemplateCont;
        break;
      }
      ret += '$';
    } else if (char < 0x5d) {
      if (char === Chars.Backslash) {
        char = readNext(parser);

        if (char >= 0x7d) {
          ret += fromCodePoint(char);
        } else {
          const code = scanEscapeSequence(parser, context, source, char);

          if (code >= 0) {
            ret += fromCodePoint(code);
            parser.index--;
          } else if (code !== Escape.Empty && context & Context.TaggedTemplate) {
            ret = null;
            char = scanBadTemplate(parser, context, source);
            if (char < 0) {
              char = -char;
              token = Token.TemplateCont;
            }
            break;
          } else {
            handleStringError(parser, code as Escape, /* isTemplate */ 1);
          }
          char = source.charCodeAt(parser.index);
        }
      } else {
        if ((CharTypes[char] & CharFlags.LineTerminator) === CharFlags.LineTerminator) {
          if (char === Chars.CarriageReturn) {
            if (parser.index < parser.length && source.charCodeAt(parser.index) === Chars.LineFeed) {
              ret += fromCodePoint(char);
              char = source.charCodeAt(parser.index);
              parser.index++;
              parser.lineBase++;
            }
          }
          parser.offset = parser.index;
          parser.lineBase++;
        }
        ret += fromCodePoint(char);
      }
    } else {
      if ((char ^ Chars.LineSeparator) <= 1) {
        parser.offset = parser.index;
        parser.lineBase++;
      }
      ret += fromCodePoint(char);
    }

    char = readNext(parser);
  }

  parser.index++;
  parser.tokenValue = ret;
  parser.tokenRaw = source.slice(start + 1, parser.index - (token === Token.TemplateTail ? 1 : 2));

  return token;
}

function scanBadTemplate(parser: ParserState, _context: Context, source: string): number {
  let char = source.charCodeAt(parser.index);
  while (char !== Chars.Backtick) {
    if (char === Chars.Dollar) {
      const index = parser.index + 1;
      if (index < source.length && source.charCodeAt(index) === Chars.LeftBrace) {
        parser.index = index;
        return -char;
      }
    }

    char = readNext(parser);
  }

  return char;
}

export function scanTemplateTail(parser: ParserState, context: Context): Token {
  if (parser.index >= parser.length) report(parser, Errors.Unexpected);
  parser.index--;
  return scanTemplate(parser, context, parser.source);
}