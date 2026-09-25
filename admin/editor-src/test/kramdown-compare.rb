# Compares how the SITE'S renderer (kramdown, GFM input, as on GitHub Pages)
# renders each story body BEFORE vs AFTER a round trip through the visual editor.
# This is the check that matters — kramdown differs from CommonMark in places
# (e.g. "##Heading" with no space is a heading in kramdown).
#
#   RT_DUMP_DIR=/tmp/rt npm test     # writes *.before.md / *.after.md
#   bundle exec ruby test/kramdown-compare.rb /tmp/rt
require "kramdown"
require "kramdown-parser-gfm"

dir = ARGV[0] or abort "usage: kramdown-compare.rb <dump dir>"

# Jekyll runs Liquid before kramdown, so a YouTube include is already a block of
# HTML by then. Swap it for a stand-in on BOTH sides so raw tags compare fairly.
def prerender(md)
  md.gsub(/^\{%\s*include youtube\.html id="([\w-]+)"\s*%\}\s*$/) { %(<div class="video-embed" data-id="#{$1}"></div>) }
end

def render(md)
  Kramdown::Document.new(prerender(md), input: "GFM", hard_wrap: false).to_html
end

# whitespace-insensitive; <strong><a>x</a></strong> == <a><strong>x</strong></a> (looks identical)
def norm(html)
  html.gsub(/>\s+</, "><").gsub(/\s+/, " ")
      .gsub(%r{<(strong|em)>(<a [^>]*>)(.*?)</a></\1>}, '\2<\1>\3</\1></a>').strip
end

bad = 0
Dir[File.join(dir, "*.before.md")].sort.each do |before|
  name = File.basename(before, ".before.md")
  a = norm(render(File.read(before)))
  b = norm(render(File.read(before.sub(".before.md", ".after.md"))))
  if a == b
    puts "  ✓ #{name}"
  else
    bad += 1
    i = 0
    i += 1 while i < a.length && a[i] == b[i]
    puts "  ✗ #{name}\n      differs at char #{i}\n      before: …#{a[[i - 50, 0].max, 150]}\n      after : …#{b[[i - 50, 0].max, 150]}"
  end
end
puts bad.zero? ? "\nkramdown renders every story identically after the round trip." : "\n#{bad} DIFFERENCE(S)"
exit(bad.zero? ? 0 : 1)
