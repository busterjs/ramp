puts "Open http://localhost:9292/test/integration/cross_frame/index.html in the browser you want to test."
run Rack::Directory.new(File.dirname(__FILE__) + "/../../../")