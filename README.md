# ramp

[![Build status](https://secure.travis-ci.org/busterjs/ramp.png?branch=master)](http://travis-ci.org/busterjs/ramp)

A ramp that makes browsers crash and burn, and hopefully run some tests.

## Running tests

Ramp is actually about loading a document of your choice (by default a plain html5 doc) and a bunch of scripts into a browser, and set it up so you can emit events to and from the browsers and a central hub that gets events from all browsers passed to it.

This is what Buster.JS uses to run tests. The central hub emits an event when the test run should start, the slaves emits events when tests fail or pass, and so on.

But you can use ramp to whatever. Not just running tests.

## Examples

So, yeah.


## Changelog

**1.0.6** (15.10.2014)

* `/slave_death` event is now published

**1.0.5** (30.09.2014)

* it is now possible to pass slave id as url param

**1.0.4** (14.05.2014)

* support for static paths
* `"SIGINT"` isn't hooked anymore
