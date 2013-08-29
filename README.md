# ramp

A ramp that makes browsers crash and burn, and hopefully run some tests.

## Running tests

Ramp is actually about loading a document of your choice (by default a plain html5 doc) and a bunch of scripts into a browser, and set it up so you can emit events to and from the browsers and a central hub that gets events from all browsers passed to it.

This is what Buster.JS uses to run tests. The central hub emits an event when the test run should start, the slaves emits events when tests fail or pass, and so on.

But you can use ramp to whatever. Not just running tests.

## Examples

So, yeah.
