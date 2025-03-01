import { kNumberRegExp } from "./store_types_and_constants";  


describe("number regular expression", () => {
  it("matches basic numbers", () => {
    expect("123".match(kNumberRegExp)).toBeTruthy();
    expect("123.456".match(kNumberRegExp)).toBeTruthy();
    expect("1/2".match(kNumberRegExp)).toBeTruthy();
    expect("1.5/3".match(kNumberRegExp)).toBeTruthy();
    expect("-1".match(kNumberRegExp)![0]).toBe("-1");
    expect("100%".match(kNumberRegExp)![0]).toBe("100%");
  });

  it("fails to match non-numbers", () => {
    expect("a".match(kNumberRegExp)).toBeFalsy();
    expect("1a".match(kNumberRegExp)).toBeFalsy();
    expect("1-2-3".match(kNumberRegExp)).toBeFalsy();
    expect("1-".match(kNumberRegExp)).toBeFalsy();
  });

  it("matches numbers in context", () => {
    expect("A perfect 10!".match(kNumberRegExp)![0]).toBe("10");
    expect("Sadly, just 1/5 stars.".match(kNumberRegExp)![0]).toBe("1/5");
    expect("1, 2, 3, let's go!".match(kNumberRegExp)![0]).toBe("1");
    expect("$10.99? Outrageous!".match(kNumberRegExp)![0]).toBe("10.99");
    expect(`A simple response: "11"`.match(kNumberRegExp)![0]).toBe("11");
    expect("At 12:30 sharp!".match(kNumberRegExp)![0]).toBe("12");
    expect("20% off is a steal!".match(kNumberRegExp)![0]).toBe("20%");
    expect("$5.00".match(kNumberRegExp)![0]).toBe("5.00");
  });
});
