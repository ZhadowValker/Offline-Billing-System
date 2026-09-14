const ones = [
  "",
  "ONE",
  "TWO",
  "THREE",
  "FOUR",
  "FIVE",
  "SIX",
  "SEVEN",
  "EIGHT",
  "NINE",
];

const teens = [
  "TEN",
  "ELEVEN",
  "TWELVE",
  "THIRTEEN",
  "FOURTEEN",
  "FIFTEEN",
  "SIXTEEN",
  "SEVENTEEN",
  "EIGHTEEN",
  "NINETEEN",
];

const tens = [
  "",
  "",
  "TWENTY",
  "THIRTY",
  "FORTY",
  "FIFTY",
  "SIXTY",
  "SEVENTY",
  "EIGHTY",
  "NINETY",
];

const scales = [
  "",
  "THOUSAND",
  "LAKH",
  "CRORE",
];

function convertHundreds(num: number): string {
  let result = "";

  const hundreds = Math.floor(num / 100);
  if (hundreds > 0) {
    result += ones[hundreds] + " HUNDRED";
  }

  const remainder = num % 100;
  if (remainder > 0) {
    if (result) result += " ";

    if (remainder < 10) {
      result += ones[remainder];
    } else if (remainder < 20) {
      result += teens[remainder - 10];
    } else {
      const ten = Math.floor(remainder / 10);
      const one = remainder % 10;
      result += tens[ten];
      if (one > 0) {
        result += " " + ones[one];
      }
    }
  }

  return result.trim();
}

export function convertNumberToWords(num: number): string {
  if (num === 0) return "ZERO";
  if (num < 0) return "MINUS " + convertNumberToWords(-num);

  const parts: string[] = [];
  let scaleIndex = 0;

  while (num > 0 && scaleIndex < scales.length) {
    const part = num % 100;
    if (scaleIndex === 2) {
      // For lakhs, we take 2 digits
      const remainder = num % 100;
      if (remainder > 0) {
        parts.unshift(convertHundreds(remainder) + " " + scales[scaleIndex]);
      }
      num = Math.floor(num / 100);
    } else if (scaleIndex === 3) {
      // For crores, we take 2 digits
      const remainder = num % 100;
      if (remainder > 0) {
        parts.unshift(convertHundreds(remainder) + " " + scales[scaleIndex]);
      }
      num = Math.floor(num / 100);
    } else {
      // For ones and thousands, we take 3 digits
      const remainder = num % 1000;
      if (remainder > 0) {
        const hundreds = Math.floor(remainder / 100);
        const twoDigits = remainder % 100;

        let part_str = "";
        if (hundreds > 0) {
          part_str += ones[hundreds] + " HUNDRED";
        }

        if (twoDigits > 0) {
          if (part_str) part_str += " ";

          if (twoDigits < 10) {
            part_str += ones[twoDigits];
          } else if (twoDigits < 20) {
            part_str += teens[twoDigits - 10];
          } else {
            const ten = Math.floor(twoDigits / 10);
            const one = twoDigits % 10;
            part_str += tens[ten];
            if (one > 0) {
              part_str += " " + ones[one];
            }
          }
        }

        if (scaleIndex > 0 && part_str) {
          part_str += " " + scales[scaleIndex];
        }

        if (part_str) {
          parts.unshift(part_str);
        }
      }
      num = Math.floor(num / 1000);
    }
    scaleIndex++;
  }

  return parts.join(" ").trim();
}
