// this list was generated by removing the word/numbers in the following list:
// https://github.com/cjhutto/vaderSentiment/blob/master/vaderSentiment/vader_lexicon.txt
// and copying them into emoticons.txt and then extracting the initial characters up to the
// first space using: awk '{print $1}' emoticons.txt

const rawEmoticons = `
$:
%)
%-)
&-:
&:
(%
('-:
(':
((-:
(*
(-%
(-*
(-:
(-:0
(-:<
(-:o
(-:O
(-:{
(-:|>*
(-;
(-;|
(8
(:
(:0
(:<
(:o
(:O
(;
(;<
(=
(?:
(^:
(^;
(^;0
(^;o
(o:
)':
)-':
)-:
)-:<
)-:{
):
):<
):{
);<
*)
*-)
*-:
*-;
*:
*<|:-)
*\0/*
*^:
,-:
---'-;-{@
--<--<@
.-:
..###-:
..###:
/-:
/:
/:<
/=
/^:
/o:
0-8
0-|
0:)
0:-)
0:-3
0:03
0;^)
0_o
3:(
3:)
3:-(
3:-)
8)
8-d
8-o
:###..
:$
:&
:'(
:')
:'-(
:'-)
:(
:)
:*
:-###..
:-&
:-(
:-)
:-))
:-*
:-,
:-.
:-/
:-<
:-d
:-D
:-o
:-p
:-[
:-\
:-c
:-p
:-|
:-||
:-Þ
:/
:<
:>
:?)
:?c
:@
:d
:D
:l
:o
:p
:s
:[
:\
:]
:^)
:^*
:^/
:^\
:^|
:c
:c)
:o)
:o/
:o\
:o|
:P
:{
:|
:}
:Þ
;)
;-)
;-*
;-]
;d
;D
;]
;^)
</3
<3
<:
<:-|
=)
=-3
=-d
=-D
=/
=3
=d
=D
=l
=\
=]
=p
=|
>-:
>.<
>:
>:(
>:)
>:-(
>:-)
>:/
>:o
>:p
>:[
>:\
>;(
>;)
>_>^
@:
@>-->--
@}-;-'---
o-8
o-:
o-|
o.o
O.o
o.O
o:
o:)
o:-)
o:-3
o:3
o:<
o;^)
o_o
O_o
o_O
[-;
[:
[;
[=
\\-:
\\:
\\:<
\\=
\\^:
\\o/
\\o:
]-:
]:
]:<
^<_<
{:
|-0
|-:
|-:>
|-o
|:
|;-)
|=
|^:
|o:
||-:
}:
}:(
}:)
}:-(
}:-)
`;

const filteredEmoticons = rawEmoticons.split("\n").filter(s => s.length > 0);
const sortedEmoticons = filteredEmoticons.sort((a, b) => {
  // Sort first by length (descending)
  if (a.length !== b.length) {
    return b.length - a.length;
  }
  // then sort alphabetically
  return a.localeCompare(b);
})
const escapedEmoticons = sortedEmoticons.map(e => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

export const emoticons = escapedEmoticons.join("|");